import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommunityNotification } from '../../models/community.model';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';
import { useImageFallback } from '../../../Premium/utils/image-fallback';

@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.css']
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  open: boolean = false;
  unreadCount: number = 0;
  notifications: CommunityNotification[] = [];
  loading: boolean = false;
  hasMore: boolean = false;
  private page = 1;
  private readonly pageSize = 12;
  private refreshTimer: any = null;
  onImageError = useImageFallback;

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router
  ) {}

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  ngOnInit(): void {
    if (!this.isLoggedIn) return;
    this.refreshUnread();
    this.refreshTimer = setInterval(() => this.refreshUnread(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  refreshUnread(): void {
    this.communityData.getUnreadNotificationCount().subscribe({
      next: (result) => this.unreadCount = result.count,
      error: () => this.unreadCount = 0
    });
  }

  toggle(): void {
    if (!this.isLoggedIn) {
      this.router.navigate(['/login']);
      return;
    }
    this.open = !this.open;
    if (this.open) {
      this.loadNotifications(true);
    }
  }

  close(): void {
    this.open = false;
  }

  loadNotifications(reset: boolean = false): void {
    if (reset) {
      this.page = 1;
      this.notifications = [];
      this.hasMore = true;
    }
    this.loading = true;
    this.communityData.getNotifications(this.page, this.pageSize).subscribe({
      next: (result) => {
        this.notifications = reset ? result.notifications : [...this.notifications, ...result.notifications];
        this.hasMore = result.hasMore;
        this.unreadCount = result.unreadCount;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  loadMore(): void {
    if (this.hasMore && !this.loading) {
      this.page += 1;
      this.loadNotifications();
    }
  }

  onNotificationClick(notification: CommunityNotification): void {
    if (!notification.read) {
      this.communityData.markNotificationRead(notification.id).subscribe({
        next: () => {
          notification.read = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
      });
    }
    this.close();
    if (notification.postId) {
      this.router.navigate(['/community/post', notification.postId]);
    } else if (notification.actor) {
      this.router.navigate(['/community/profile', notification.actor.id]);
    }
  }

  markAllRead(): void {
    this.communityData.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.forEach((n) => n.read = true);
        this.unreadCount = 0;
      }
    });
  }
}
