/* TedBus push-notification service worker.
 *
 * Receives `push` events delivered by the browser's push service and shows a
 * system notification. Clicking the notification focuses/opens the app at the
 * deep link included in the payload.
 *
 * Handles `pushsubscriptionchange` to re-subscribe when the browser rotates
 * the push endpoint (browsers do this periodically). The new subscription is
 * re-registered on the backend so server-side delivery keeps working.
 *
 * This file must stay framework-free (no ES modules / TypeScript) — it is
 * registered as-is at /sw.js.
 */

const APP_ORIGIN = self.location.origin;
const DEFAULT_ICON = '/assets/logo.png';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: 'TedBus', body: String(event.data || '') };
  }

  const title = payload.title || 'TedBus';
  const options = {
    body: payload.body || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: payload.tag || payload.url || undefined,
    data: {
      url: payload.url || '/notifications'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const target = new URL(targetUrl, APP_ORIGIN);
        if (clientUrl.origin === target.origin && 'focus' in client) {
          client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

/* ---- Subscription rotation handler ----
 * When the browser rotates the push endpoint (quota exceeded, server-side
 * purge, etc.) it fires `pushsubscriptionchange`. We re-subscribe with the
 * same VAPID key and POST the new subscription to the backend so delivery
 * keeps working without user interaction. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Fetch the VAPID public key from the backend.
        const keyResp = await fetch('/notifications/push-public-key');
        if (!keyResp.ok) throw new Error('VAPID key fetch failed: ' + keyResp.status);
        const { publicKey } = await keyResp.json();
        if (!publicKey) throw new Error('VAPID public key is empty');

        // Convert the base64url key to Uint8Array for PushManager.
        const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const applicationServerKey = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          applicationServerKey[i] = raw.charCodeAt(i);
        }

        // Re-subscribe.
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        // Register the new subscription on the backend.
        const subJson = sub.toJSON();
        await fetch('/notifications/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subJson),
        });

        console.log('[SW] pushsubscriptionchange: re-subscribed and registered on server.');
      } catch (err) {
        console.error('[SW] pushsubscriptionchange failed:', err);
      }
    })()
  );
});
