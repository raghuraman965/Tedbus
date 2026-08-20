import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../Premium/services/auth.service';
import { NotificationService } from './notification.service';
import { AppNotification } from '../model/notification.model';
import { url } from '../config';

const SERVER_URL = url.replace(/\/$/, '');

/**
 * Real-time notification bridge. Keeps one authenticated Socket.IO connection
 * to the backend, listens for `notification:new` events (pushed by the server
 * straight after a notification is created), and feeds them into the
 * NotificationService so the bell badge/dropdown update instantly.
 *
 * The connection is created when a user logs in and torn down on logout.
 * On reconnect the unread count is re-fetched so the badge never drifts.
 */
@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService implements OnDestroy {
  private socket: Socket | null = null;

  constructor(
    private ngZone: NgZone,
    private auth: AuthService,
    private notifications: NotificationService
  ) {
    this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private connect(): void {
    if (this.socket) return;
    const token = this.auth.token;
    if (!token) return;

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    this.socket.on('connect', () => {
      // Fresh connection or reconnect — resync the badge with the server.
      this.ngZone.run(() => {
        this.notifications.refreshUnread();
        this.notifications.loadRecent();
      });
    });

    this.socket.on('notification:new', (payload: { notification: AppNotification }) => {
      this.ngZone.run(() => {
        if (payload && payload.notification) {
          this.notifications.prependNotification(payload.notification);
        }
      });
    });
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.notifications.reset();
  }
}
