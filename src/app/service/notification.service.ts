import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { url } from '../config';
import { AuthService } from '../Premium/services/auth.service';
import {
  AppNotification,
  NotificationPreferences,
  NotificationsPage,
  NotificationCategory
} from '../model/notification.model';

/**
 * API client + shared client-side state for the customer notification center.
 *
 * Holds the live unread count (`unread$`) and the most recent notifications
 * (`recent$`) so the navbar bell badge and dropdown update instantly when the
 * realtime socket delivers a `notification:new` event. Every mutation (mark
 * read / mark all / delete) keeps these observables in sync.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private base = url + 'notifications';
  private readonly recentLimit = 20;

  private unreadSubject = new BehaviorSubject<number>(0);
  private recentSubject = new BehaviorSubject<AppNotification[]>([]);

  /** Live unread count — the bell badge subscribes to this. */
  unread$: Observable<number> = this.unreadSubject.asObservable();
  /** Most recent notifications (prepended in real time). */
  recent$: Observable<AppNotification[]> = this.recentSubject.asObservable();

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): { Authorization?: string } {
    const token = this.auth.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private params(
    page: number,
    limit: number,
    filters?: { category?: NotificationCategory | string; read?: boolean }
  ): HttpParams {
    let p = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters?.category) p = p.set('category', filters.category);
    if (filters?.read !== undefined) p = p.set('read', String(filters.read));
    return p;
  }

  get isLoggedIn(): boolean {
    return this.auth.isLoggedIn;
  }

  /** Fetches a page of notifications and syncs the unread count from the response. */
  getNotifications(page = 1, limit = 20, filters?: { category?: string; read?: boolean }): Observable<NotificationsPage> {
    return new Observable<NotificationsPage>((subscriber) => {
      this.http
        .get<NotificationsPage>(this.base, { headers: this.headers(), params: this.params(page, limit, filters as any) })
        .subscribe({
          next: (res) => {
            this.unreadSubject.next(res.unread);
            subscriber.next(res);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err)
        });
    });
  }

  /** Reloads the unread count from the server (used on login and socket reconnect). */
  refreshUnread(): void {
    if (!this.isLoggedIn) {
      this.unreadSubject.next(0);
      return;
    }
    this.http.get<{ count: number }>(this.base + '/unread-count', { headers: this.headers() }).subscribe({
      next: (res) => this.unreadSubject.next(Number(res.count) || 0),
      // On a transient network failure keep the last known count instead of
      // falsely clearing the badge.
      error: () => undefined
    });
  }

  /** Loads the latest page into the shared recent list shown in the bell dropdown. */
  loadRecent(): void {
    if (!this.isLoggedIn) {
      this.recentSubject.next([]);
      return;
    }
    this.http
      .get<NotificationsPage>(this.base, { headers: this.headers(), params: this.params(1, this.recentLimit) })
      .subscribe({
        next: (res) => {
          this.recentSubject.next(res.items);
          this.unreadSubject.next(res.unread);
        },
        error: () => undefined
      });
  }

  /** Inserts a notification received in real time at the top of the list. */
  prependNotification(notification: AppNotification): void {
    const current = this.recentSubject.value;
    // A duplicate socket event for the same _id must not re-increment the
    // badge or re-order the list.
    if (current.some((n) => n._id === notification._id)) return;
    if (!notification.read) {
      this.unreadSubject.next(this.unreadSubject.value + 1);
    }
    this.recentSubject.next([notification, ...current].slice(0, this.recentLimit));
  }

  markRead(id: string): Observable<AppNotification> {
    return new Observable<AppNotification>((subscriber) => {
      this.http.patch<AppNotification>(`${this.base}/${id}/read`, {}, { headers: this.headers() }).subscribe({
        next: (res) => {
          this.adjustUnread(-1);
          const list = this.recentSubject.value.map((n) => (n._id === id ? { ...n, read: true, readAt: res.readAt } : n));
          this.recentSubject.next(list);
          subscriber.next(res);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err)
      });
    });
  }

  markAllRead(): Observable<{ updated: number }> {
    return new Observable<{ updated: number }>((subscriber) => {
      this.http.post<{ updated: number }>(this.base + '/read-all', {}, { headers: this.headers() }).subscribe({
        next: (res) => {
          this.unreadSubject.next(0);
          this.recentSubject.next(this.recentSubject.value.map((n) => ({ ...n, read: true })));
          subscriber.next(res);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err)
      });
    });
  }

  deleteNotification(id: string): Observable<{ deleted: boolean }> {
    return new Observable<{ deleted: boolean }>((subscriber) => {
      this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`, { headers: this.headers() }).subscribe({
        next: (res) => {
          const removed = this.recentSubject.value.find((n) => n._id === id);
          if (removed && !removed.read) {
            this.adjustUnread(-1);
          }
          this.recentSubject.next(this.recentSubject.value.filter((n) => n._id !== id));
          subscriber.next(res);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err)
      });
    });
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(this.base + '/preferences', { headers: this.headers() });
  }

  updatePreferences(prefs: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(this.base + '/preferences', prefs, { headers: this.headers() });
  }

  getPushPublicKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(this.base + '/push-public-key');
  }

  getPushStatus(): Observable<{ ok: boolean; subscribed: boolean; subscriptionCount: number }> {
    return this.http.get<{ ok: boolean; subscribed: boolean; subscriptionCount: number }>(
      this.base + '/push-status',
      { headers: this.headers() }
    );
  }

  registerPushSubscription(subscription: PushSubscriptionJSON): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(this.base + '/push-subscription', subscription, { headers: this.headers() });
  }

  removePushSubscription(endpoint: string): Observable<{ ok: boolean }> {
    return this.http.request<{ ok: boolean }>('delete', this.base + '/push-subscription', {
      body: { endpoint },
      headers: this.headers()
    });
  }

  sendTestPush(): Observable<{ ok: boolean; delivered: number; total: number; failures: string[]; message?: string }> {
    return this.http.post<{ ok: boolean; delivered: number; total: number; failures: string[]; message?: string }>(
      this.base + '/test-push',
      {},
      { headers: this.headers() }
    );
  }

  reset(): void {
    this.unreadSubject.next(0);
    this.recentSubject.next([]);
  }

  private adjustUnread(delta: number): void {
    this.unreadSubject.next(Math.max(0, this.unreadSubject.value + delta));
  }
}
