import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../service/notification.service';
import {
  AppNotification,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_ICON,
  NotificationCategory
} from '../../../model/notification.model';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-notification-history',
  templateUrl: './notification-history.component.html',
  styleUrls: ['./notification-history.component.css']
})
export class NotificationHistoryComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  total = 0;
  unreadCount = 0;
  loading = false;
  hasMore = false;
  activeCategory: NotificationCategory | 'all' = 'all';
  categories = NOTIFICATION_CATEGORIES;
  categoryIcon = NOTIFICATION_CATEGORY_ICON;

  private page = 1;
  private readonly pageSize = 20;
  private unreadSub?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private languageService: LanguageService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.unreadSub = this.notificationService.unread$.subscribe((count) => (this.unreadCount = count));
    this.load(true);
  }

  ngOnDestroy(): void {
    this.unreadSub?.unsubscribe();
  }

  relativeTime(value: string): string {
    return this.languageService.formatRelative(value);
  }

  load(reset = false): void {
    if (reset) {
      this.page = 1;
      this.notifications = [];
      this.hasMore = true;
    }
    this.loading = true;
    const category = this.activeCategory === 'all' ? undefined : this.activeCategory;
    this.notificationService.getNotifications(this.page, this.pageSize, { category }).subscribe({
      next: (res) => {
        this.notifications = reset ? res.items : [...this.notifications, ...res.items];
        this.total = res.total;
        this.unreadCount = res.unread;
        this.hasMore = res.hasMore;
        this.loading = false;
      },
      error: () => (this.loading = false)
    });
  }

  loadMore(): void {
    if (!this.hasMore || this.loading) return;
    this.page += 1;
    this.load();
  }

  selectCategory(category: NotificationCategory | 'all'): void {
    if (this.activeCategory === category) return;
    this.activeCategory = category;
    this.load(true);
  }

  markRead(notification: AppNotification): void {
    if (notification.read) return;
    this.notificationService.markRead(notification._id).subscribe({ error: () => undefined });
  }

  markAllRead(): void {
    this.notificationService.markAllRead().subscribe({
      next: () => {
        // Keep the rendered list in sync so rows stop looking unread without
        // a reload (the shared service already zeroed the badge).
        this.notifications = this.notifications.map((n) => (n.read ? n : { ...n, read: true, readAt: new Date().toISOString() }));
        this.unreadCount = 0;
      },
      error: () => undefined
    });
  }

  deleteNotification(notification: AppNotification): void {
    this.notificationService.deleteNotification(notification._id).subscribe({
      next: () => {
        this.notifications = this.notifications.filter((n) => n._id !== notification._id);
        this.total = Math.max(0, this.total - 1);
      },
      error: () => undefined
    });
  }

  openNotification(notification: AppNotification): void {
    if (!notification.read) {
      this.markRead(notification);
    }
    if (notification.link && !notification.link.startsWith('http')) {
      this.router.navigate([notification.link]);
    } else if (notification.link) {
      window.open(notification.link, '_blank');
    } else {
      this.router.navigate(['/notifications']);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
