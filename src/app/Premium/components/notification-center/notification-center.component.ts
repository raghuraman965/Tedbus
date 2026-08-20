import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../../service/notification.service';
import { AppNotification, NOTIFICATION_CATEGORY_ICON } from '../../../model/notification.model';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-notification-center',
  templateUrl: './notification-center.component.html',
  styleUrls: ['./notification-center.component.css']
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  open = false;
  unreadCount = 0;
  notifications: AppNotification[] = [];
  categoryIcon = NOTIFICATION_CATEGORY_ICON;

  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private languageService: LanguageService,
    private router: Router
  ) {}

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  ngOnInit(): void {
    this.subs.push(
      this.authService.currentUser$.subscribe((user) => {
        if (user) {
          this.notificationService.refreshUnread();
          this.notificationService.loadRecent();
        } else {
          this.notifications = [];
          this.unreadCount = 0;
        }
      }),
      this.notificationService.unread$.subscribe((count) => (this.unreadCount = count)),
      this.notificationService.recent$.subscribe((list) => (this.notifications = list))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  relativeTime(value: string): string {
    return this.languageService.formatRelative(value);
  }

  toggle(): void {
    if (!this.isLoggedIn) {
      this.router.navigate(['/login']);
      return;
    }
    this.open = !this.open;
    if (this.open) {
      this.notificationService.loadRecent();
    }
  }

  close(): void {
    this.open = false;
  }

  onNotificationClick(notification: AppNotification): void {
    if (!notification.read) {
      this.notificationService.markRead(notification._id).subscribe({ error: () => undefined });
    }
    this.close();
    if (notification.link && !notification.link.startsWith('http')) {
      this.router.navigate([notification.link]);
    } else if (notification.link) {
      window.open(notification.link, '_blank');
    } else {
      this.router.navigate(['/notifications']);
    }
  }

  markAllRead(): void {
    this.notificationService.markAllRead().subscribe({ error: () => undefined });
  }

  deleteNotification(event: Event, notification: AppNotification): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(notification._id).subscribe({ error: () => undefined });
  }

  openHistory(): void {
    this.close();
    this.router.navigate(['/notifications']);
  }

  openPreferences(): void {
    this.close();
    this.router.navigate(['/notifications/preferences']);
  }
}
