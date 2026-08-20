import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';
import {
  CommunityPost,
  CommunityStats,
  CommunityUser,
  RecentReport,
  ReportedUser
} from '../../models/community.model';
import { resolveImageUrl, useImageFallback } from '../../../Premium/utils/image-fallback';

@Component({
  selector: 'app-community-admin',
  templateUrl: './community-admin.component.html',
  styleUrls: ['./community-admin.component.css']
})
export class CommunityAdminComponent implements OnInit {
  isAdmin: boolean = false;
  loading: boolean = true;
  errorMessage: string = '';
  onImageError = useImageFallback;

  stats: CommunityStats | null = null;
  reportedPosts: CommunityPost[] = [];
  recentReports: RecentReport[] = [];
  reportedUsers: ReportedUser[] = [];
  unverifiedUsers: (CommunityUser & { email: string; provider: string })[] = [];

  actionMessage: string = '';
  actionError: string = '';
  busyPostId: string = '';
  busyUserId: string = '';

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.communityData.isCurrentUserAdmin;
    if (!this.isAdmin) {
      this.router.navigate(['/community']);
      return;
    }
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMessage = '';
    this.actionMessage = '';
    this.actionError = '';

    this.communityData.getCommunityStats().subscribe({
      next: (stats) => this.stats = stats,
      error: (error) => this.errorMessage = this.readError(error)
    });
    this.communityData.getReportedPosts().subscribe({
      next: (posts) => this.reportedPosts = posts,
      error: (error) => this.errorMessage = this.readError(error)
    });
    this.communityData.getRecentReports().subscribe({
      next: (reports) => this.recentReports = reports,
      error: (error) => this.errorMessage = this.readError(error)
    });
    this.communityData.getReportedUsers().subscribe({
      next: (users) => this.reportedUsers = users,
      error: (error) => this.errorMessage = this.readError(error)
    });
    this.communityData.getUnverifiedUsers().subscribe({
      next: (users) => this.unverifiedUsers = users,
      error: (error) => this.errorMessage = this.readError(error)
    });
    this.loading = false;
  }

  private readError(error: any): string {
    return error?.error?.error || this.translate.instant('community.moderationLoadError');
  }

  private flashMessage(msg: string, isError: boolean = false): void {
    if (isError) {
      this.actionError = msg;
      this.actionMessage = '';
    } else {
      this.actionMessage = msg;
      this.actionError = '';
    }
    setTimeout(() => {
      this.actionMessage = '';
      this.actionError = '';
    }, 3500);
  }

  openPost(id: string): void {
    this.router.navigate(['/community/post', id]);
  }

  getImageUrl(src: string): string {
    return resolveImageUrl(src);
  }

  openProfile(userId: string): void {
    this.router.navigate(['/community/profile', userId]);
  }

  moderatePost(post: CommunityPost, action: 'remove' | 'restore' | 'dismiss'): void {
    this.busyPostId = post.id;
    this.communityData.moderatePost(post.id, action).subscribe({
      next: (result) => {
        this.busyPostId = '';
        this.reportedPosts = this.reportedPosts.filter((p) => p.id !== post.id);
        this.recentReports = this.recentReports.filter((r) => r.postId !== post.id);
        this.flashMessage(result.message);
        this.loadStats();
      },
      error: (error) => {
        this.busyPostId = '';
        this.flashMessage(this.readError(error), true);
      }
    });
  }

  moderateUser(user: ReportedUser, action: 'suspend' | 'restore'): void {
    this.busyUserId = user.user.id;
    this.communityData.moderateUser(user.user.id, action).subscribe({
      next: (result) => {
        this.busyUserId = '';
        user.suspended = action === 'suspend';
        this.flashMessage(result.message);
      },
      error: (error) => {
        this.busyUserId = '';
        this.flashMessage(this.readError(error), true);
      }
    });
  }

  verifyUser(user: ReportedUser, action: 'approve' | 'revoke'): void {
    this.busyUserId = user.user.id;
    this.communityData.verifyUser(user.user.id, action).subscribe({
      next: (result) => {
        this.busyUserId = '';
        user.user.verified = action === 'approve';
        this.flashMessage(result.message);
      },
      error: (error) => {
        this.busyUserId = '';
        this.flashMessage(this.readError(error), true);
      }
    });
  }

  verifyMember(user: CommunityUser & { email: string; provider: string }): void {
    this.busyUserId = user.id;
    this.communityData.verifyUser(user.id, 'approve').subscribe({
      next: (result) => {
        this.busyUserId = '';
        this.unverifiedUsers = this.unverifiedUsers.filter((u) => u.id !== user.id);
        this.flashMessage(result.message);
      },
      error: (error) => {
        this.busyUserId = '';
        this.flashMessage(this.readError(error), true);
      }
    });
  }

  private loadStats(): void {
    this.communityData.getCommunityStats().subscribe({
      next: (stats) => this.stats = stats
    });
  }
}
