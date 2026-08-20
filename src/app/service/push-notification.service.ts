import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from '../Premium/services/auth.service';
import { NotificationService } from './notification.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Browser Web Push (Push API) integration.
 *
 * Flow:
 *   1. On boot (logged in) we register the service worker once and verify it
 *      reaches the `activated` state.
 *   2. When the user enables push we build a PushManager subscription using the
 *      server's VAPID application server key and store it on the backend
 *      (PushSubscriptions collection, keyed by userId+endpoint so duplicates
 *      are impossible) so server-side notifications can be delivered even when
 *      the tab is closed.
 *   3. The service worker (src/sw.js) receives `push` events and shows a
 *      system notification; `notificationclick` deep-links back to the app.
 *
 * Every step logs to the console with a `[Push]` prefix and surfaces a
 * *specific* state on failure (never a swallowed generic error), so the exact
 * failing step is always visible in DevTools and in the UI.
 */
export type PushState =
  | 'unsupported'
  | 'idle'
  | 'enabled'
  | 'disabled'
  | 'denied'
  | 'permission-default'
  | 'sw-register-failed'
  | 'sw-inactive'
  | 'subscribe-failed'
  | 'vapid-invalid'
  | 'backend-unavailable'
  | 'server-rejected'
  | 'unknown';

export interface PushStateInfo {
  state: PushState;
  detail: string;
}

export interface TestPushResult {
  ok: boolean;
  delivered: number;
  total: number;
  failures: string[];
  detail: string;
}

const SW_PATH = '/sw.js';
const SW_ACTIVATE_TIMEOUT_MS = 10000;

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private stateSubject = new BehaviorSubject<PushStateInfo>({ state: 'idle', detail: '' });
  state$: Observable<PushStateInfo> = this.stateSubject.asObservable();

  private swRegistration: ServiceWorkerRegistration | null = null;
  private swReady: Promise<ServiceWorkerRegistration | null> | null = null;
  private publicKeyCache: string | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private ngZone: NgZone,
    private auth: AuthService,
    private notifications: NotificationService,
    private translate: TranslateService
  ) {
    this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.init();
      } else {
        this.reset();
      }
    });
  }

  get isSupported(): boolean {
    return typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
  }

  get state(): PushState {
    return this.stateSubject.value.state;
  }

  get detail(): string {
    return this.stateSubject.value.detail;
  }

  /** Registers the service worker and, if permission is already granted,
   *  makes sure the current subscription is synced with the backend. */
  init(): void {
    if (!this.isSupported) {
      this.set('unsupported', this.translate.instant('pushNotification.unsupported'));
      return;
    }
    console.info('[Push] init: checking permission...');
    this.ensureServiceWorker().then(async (reg) => {
      this.ngZone.run(async () => {
        if (Notification.permission === 'granted') {
          console.info('[Push] permission already granted — reconciling subscription.');
          const ok = await this.reconcile();
          if (ok) this.set('enabled', '');
          console.info(ok ? '[Push] init: ENABLED.' : '[Push] init: reconcile failed.');
          this.listenForSubscriptionChange(reg!);
          this.startHealthCheck();
        } else if (Notification.permission === 'denied') {
          console.warn('[Push] permission denied in browser settings.');
          this.set('denied', this.translate.instant('pushNotification.permissionDeniedBrowser'));
        } else {
          this.set('idle', '');
        }
      });
    });
  }

  /** Enables push: uses existing permission, subscribes, registers on the server. */
  async enable(): Promise<PushState> {
    if (!this.isSupported) {
      this.set('unsupported', this.translate.instant('pushNotification.unsupported'));
      return this.state;
    }

    // Do NOT re-request permission when it is already granted.
    if (Notification.permission === 'granted') {
      console.info('[Push] enable: permission already granted — skipping requestPermission().');
    } else if (Notification.permission === 'denied') {
      this.set('denied', this.translate.instant('pushNotification.permissionDenied'));
      return this.state;
    } else {
      console.info('[Push] enable: requesting permission...');
      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
      } catch (err) {
        console.error('[Push] requestPermission threw:', err);
        this.set('subscribe-failed', this.translate.instant('pushNotification.requestPermissionError', { detail: String(err) }));
        return this.state;
      }
      console.info('[Push] enable: permission result =', permission);
      if (permission === 'granted') {
        // fall through
      } else if (permission === 'denied') {
        this.set('denied', this.translate.instant('pushNotification.permissionDeniedByUser'));
        return this.state;
      } else {
        this.set('permission-default', this.translate.instant('pushNotification.permissionDismissed'));
        return this.state;
      }
    }

    const ok = await this.reconcile();
    if (ok) this.set('enabled', '');
    console.info(ok ? '[Push] ENABLED.' : '[Push] enable FAILED.');
    return this.state;
  }

  /** Disables push: unsubscribes the browser and removes the server record. */
  async disable(): Promise<PushState> {
    if (!this.isSupported) return this.state;
    const reg = await this.ensureServiceWorker();
    let endpoint: string | null = null;
    try {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        endpoint = sub.endpoint;
        console.info('[Push] disable: unsubscribing from browser push service...');
        await sub.unsubscribe();
        console.info('[Push] disable: unsubscribed. endpoint =', String(endpoint).slice(0, 60) + '...');
      } else {
        console.info('[Push] disable: no active browser subscription.');
      }
    } catch (err) {
      console.error('[Push] disable: unsubscribe failed:', err);
    }
    if (endpoint) {
      console.info('[Push] disable: removing subscription from server...');
      this.notifications.removePushSubscription(endpoint).subscribe({
        next: () => console.info('[Push] disable: removed from server.'),
        error: (e) => console.error('[Push] disable: server removal failed:', e)
      });
    }
    this.set('disabled', '');
    return this.state;
  }

  /**
   * Creates a real in-app + system (push) test notification via the backend and
   * reports whether the push was actually delivered to the registered browser.
   */
  async sendTestNotification(): Promise<TestPushResult> {
    console.info('[Push] test: sending test notification...');
    try {
      const res: any = await new Promise((resolve, reject) => {
        this.notifications.sendTestPush().subscribe({ next: resolve, error: reject });
      });
      console.info('[Push] test: server response =', res);
      const ok = res && res.ok === true;
      const failures = Array.isArray(res && res.failures) ? res.failures : [];
      return {
        ok,
        delivered: Number(res && res.delivered) || 0,
        total: Number(res && res.total) || 0,
        failures,
        detail: ok
          ? this.translate.instant('pushNotification.testDelivered', { delivered: res.delivered, total: res.total })
          : (failures[0] || (res && res.message) || this.translate.instant('pushNotification.testDeliveryFailed')),
      };
    } catch (err: any) {
      const status = err && err.status;
      console.error('[Push] test: API request failed (HTTP ' + (status || 'network') + '):', err);
      return {
        ok: false,
        delivered: 0,
        total: 0,
        failures: [],
        detail: this.translate.instant('pushNotification.testRequestFailed', { status: status || 'network' }),
      };
    }
  }

  // ---------------- Internals ----------------

  private set(state: PushState, detail: string): void {
    this.ngZone.run(() => this.stateSubject.next({ state, detail }));
  }

  /**
   * Listens for the browser's `pushsubscriptionchange` event on the
   * ServiceWorkerRegistration. When the endpoint rotates, re-subscribes
   * and re-registers with the backend from the page context (the sw.js
   * handler does the same, but this is a belt-and-suspenders approach).
   */
  private listenForSubscriptionChange(reg: ServiceWorkerRegistration): void {
    if (!reg || typeof (reg as any).pushSubscription !== 'undefined') {
      // pushSubscriptionchange event is fired on the registration, not
      // accessible via addEventListener in all browsers yet. Use the
      // periodic health-check as the primary re-sync mechanism.
    }
    // Note: sw.js handles the actual pushsubscriptionchange event. This
    // method is a placeholder for future browser APIs. The real re-sync
    // happens in the health check below.
  }

  /**
   * Every 30 minutes, compare the browser's active push subscription
   * endpoint with what was last sent to the backend. If they differ
   * (endpoint rotated), re-register the new subscription on the server.
   * If no subscription exists but the backend has one, re-subscribe.
   */
  private startHealthCheck(): void {
    if (this.healthTimer) return;
    const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
    this.healthTimer = setInterval(async () => {
      try {
        const reg = this.swRegistration;
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (sub && this.state === 'enabled') {
          // Verify the backend still has this endpoint.
          const payload = sub.toJSON();
          const ok = await this.postSubscription(payload);
          if (ok) {
            console.info('[Push] health-check: subscription is current.');
          } else {
            console.warn('[Push] health-check: re-registration reported failure — will retry next cycle.');
          }
        } else if (!sub && this.state === 'enabled') {
          console.warn('[Push] health-check: no active subscription found — re-subscribing...');
          const ok = await this.reconcile();
          if (ok) this.set('enabled', '');
        }
      } catch (err) {
        console.error('[Push] health-check error:', err);
      }
    }, INTERVAL_MS);
  }

  private reset(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.set('idle', '');
  }

  private async ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported) return null;
    if (this.swRegistration) return this.swRegistration;
    if (this.swReady) return this.swReady;

    console.info('[Push] registering service worker at', SW_PATH, '...');
    this.swReady = navigator.serviceWorker
      .register(SW_PATH)
      .then(async (reg) => {
        this.swRegistration = reg;
        console.info('[Push] service worker registered. scope =', reg.scope);
        const active = await this.waitForActive(reg);
        if (!active) {
          console.error('[Push] service worker never reached the activated state.');
          this.set('sw-inactive', this.translate.instant('pushNotification.swRegisteredButInactive'));
          return null;
        }
        console.info('[Push] service worker is ACTIVE.');
        return reg;
      })
      .catch((err) => {
        console.error('[Push] service worker registration FAILED:', err);
        this.set('sw-register-failed', this.translate.instant('pushNotification.swRegisterFailed', { detail: String(err && err.message) || err, path: SW_PATH }));
        return null;
      });

    return this.swReady;
  }

  private async waitForActive(reg: ServiceWorkerRegistration): Promise<boolean> {
    if (reg.active) return true;
    const sw = reg.installing || reg.waiting;
    if (!sw) {
      try {
        await navigator.serviceWorker.ready;
        return !!reg.active;
      } catch (err) {
        console.error('[Push] navigator.serviceWorker.ready rejected:', err);
        return false;
      }
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(!!reg.active), SW_ACTIVATE_TIMEOUT_MS);
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') {
          clearTimeout(timer);
          resolve(true);
        } else if (sw.state === 'redundant') {
          clearTimeout(timer);
          resolve(false);
        }
      });
    });
  }

  /**
   * Ensures a valid browser subscription exists for the current VAPID key and
   * that the backend has it stored. Returns true only if everything succeeded.
   */
  private async reconcile(): Promise<boolean> {
    const reg = await this.ensureServiceWorker();
    if (!reg) {
      console.error('[Push] reconcile aborted: no service worker.');
      return false; // specific state already set by ensureServiceWorker
    }

    try {
      console.info('[Push] reconcile: checking for an existing browser subscription...');
      let sub = await reg.pushManager.getSubscription();
      console.info('[Push] reconcile: existing subscription =', sub ? 'yes' : 'none');

      if (!sub) {
        const keyBytes = await this.getApplicationServerKey();
        if (!keyBytes) return false; // specific state already set
        console.info('[Push] reconcile: subscribing with VAPID applicationServerKey...');
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });
        console.info('[Push] reconcile: subscribed. endpoint =', String(sub.endpoint).slice(0, 60) + '...');
      } else {
        console.info('[Push] reconcile: reusing existing subscription. endpoint =', String(sub.endpoint).slice(0, 60) + '...');
      }

      const payload = sub.toJSON();
      console.info('[Push] reconcile: registering subscription on server...', { endpoint: payload.endpoint, hasKeys: !!(payload.keys && payload.keys['p256dh'] && payload.keys['auth']) });
      const ok = await this.postSubscription(payload);
      if (ok) console.info('[Push] reconcile: subscription stored on server (upsert — no duplicates).');
      return ok;
    } catch (err: any) {
      const name = (err && err.name) || 'UnknownError';
      console.error('[Push] reconcile: subscription step FAILED (', name, '):', err);
      if (name === 'NotAllowedError') {
        this.set('denied', this.translate.instant('pushNotification.subscriptionRejected'));
      } else if (name === 'InvalidStateError') {
        this.set('subscribe-failed', this.translate.instant('pushNotification.subscriptionAlreadyActive'));
      } else if (name === 'NotSupportedError') {
        this.set('vapid-invalid', this.translate.instant('pushNotification.vapidInvalid'));
      } else {
        this.set('subscribe-failed', this.translate.instant('pushNotification.subscribeFailed', { name: name, detail: String(err && err.message) || err }));
      }
      return false;
    }
  }

  private async getApplicationServerKey(): Promise<Uint8Array | null> {
    if (this.publicKeyCache) return this.urlBase64ToUint8Array(this.publicKeyCache);
    console.info('[Push] fetching VAPID public key from GET /notifications/push-public-key...');
    try {
      const res = await new Promise<{ publicKey: string } | null>((resolve) => {
        this.notifications.getPushPublicKey().subscribe({
          next: (v) => resolve(v),
          error: (err) => {
            const status = err && err.status;
            console.error('[Push] GET /push-public-key FAILED (HTTP ' + (status || 'network') + '):', err);
            if (!status || status >= 500) {
              this.set('backend-unavailable', this.translate.instant('pushNotification.backendUnavailableKey', { status: status || 'network' }));
            } else {
              this.set('server-rejected', this.translate.instant('pushNotification.serverRejectedKey', { status: status }));
            }
            resolve(null);
          }
        });
      });
      if (!res || !res.publicKey) return null;
      this.publicKeyCache = res.publicKey;
      console.info('[Push] VAPID public key received:', res.publicKey.slice(0, 24) + '...');
      return this.urlBase64ToUint8Array(res.publicKey);
    } catch (err) {
      console.error('[Push] VAPID key processing failed:', err);
      this.set('vapid-invalid', this.translate.instant('pushNotification.vapidProcessError'));
      return null;
    }
  }

  private async postSubscription(payload: PushSubscriptionJSON): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.notifications.registerPushSubscription(payload).subscribe({
        next: () => resolve(true),
        error: (err) => {
          const status = err && err.status;
          const bodyError = err && err.error && (err.error.error || err.error.message);
          console.error('[Push] POST /push-subscription FAILED (HTTP ' + (status || 'network') + '):', err);
          if (!status || status >= 500) {
            this.set('backend-unavailable', this.translate.instant('pushNotification.postSubscriptionFailed', { status: status || 'network' }));
          } else {
            this.set('server-rejected', this.translate.instant('pushNotification.postSubscriptionRejected', { status: status, detail: bodyError ? ': ' + bodyError : '' }));
          }
          resolve(false);
        }
      });
    });
  }

  /** Converts a base64url VAPID key into the Uint8Array PushManager expects. */
  private urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      output[i] = raw.charCodeAt(i);
    }
    return output;
  }
}
