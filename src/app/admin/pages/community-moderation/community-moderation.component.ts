import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { TranslateService } from '@ngx-translate/core';

type Tab = 'posts' | 'comments' | 'reports' | 'log';

@Component({
  selector: 'app-community-moderation',
  templateUrl: './community-moderation.component.html',
  styleUrls: ['./community-moderation.component.css'],
})
export class AdminCommunityModerationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: Tab = 'reports';
  loading = false;
  search = '';
  statusFilter = '';
  categoryFilter = '';

  stats: any = {};
  posts: any[] = [];
  comments: any[] = [];
  reports: any[] = [];
  log: any[] = [];

  postsTotal = 0;
  commentsTotal = 0;
  reportsTotal = 0;
  logTotal = 0;

  postsPage = 1;
  commentsPage = 1;
  reportsPage = 1;
  logPage = 1;

  pageSize = 15;

  confirmAction: { type: string; id: string; label: string } | null = null;

  constructor(
    private api: AdminApiService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadTab();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: Tab): void {
    this.activeTab = tab;
    this.search = '';
    this.statusFilter = '';
    this.categoryFilter = '';
    this.loadTab();
  }

  loadTab(): void {
    switch (this.activeTab) {
      case 'posts': this.loadPosts(); break;
      case 'comments': this.loadComments(); break;
      case 'reports': this.loadReports(); break;
      case 'log': this.loadLog(); break;
    }
  }

  loadStats(): void {
    this.api.get<any>('community/stats').pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => { this.stats = res.data || {}; },
      error: () => {},
    });
  }

  loadPosts(): void {
    this.loading = true;
    const params: any = { page: this.postsPage, limit: this.pageSize };
    if (this.search) params.search = this.search;
    if (this.statusFilter) params.moderationStatus = this.statusFilter;
    if (this.categoryFilter) params.category = this.categoryFilter;
    this.api.get<any>('community/posts', params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.posts = res.data?.items || [];
        this.postsTotal = res.data?.total || 0;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  loadComments(): void {
    this.loading = true;
    const params: any = { page: this.commentsPage, limit: this.pageSize };
    if (this.search) params.search = this.search;
    if (this.statusFilter === 'deleted') params.deleted = 'true';
    else if (this.statusFilter === 'active') params.deleted = 'false';
    this.api.get<any>('community/comments', params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.comments = res.data?.items || [];
        this.commentsTotal = res.data?.total || 0;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  loadReports(): void {
    this.loading = true;
    const params: any = { page: this.reportsPage, limit: this.pageSize };
    if (this.search) params.search = this.search;
    if (this.statusFilter) params.status = this.statusFilter;
    this.api.get<any>('community/reports', params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.reports = res.data?.items || [];
        this.reportsTotal = res.data?.total || 0;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  loadLog(): void {
    this.loading = true;
    const params: any = { page: this.logPage, limit: this.pageSize };
    if (this.statusFilter) params.action = this.statusFilter;
    this.api.get<any>('community/moderation-log', params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.log = res.data?.items || [];
        this.logTotal = res.data?.total || 0;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  onSearch(): void {
    this.postsPage = 1;
    this.commentsPage = 1;
    this.reportsPage = 1;
    this.loadTab();
  }

  applyFilter(): void {
    this.postsPage = 1;
    this.commentsPage = 1;
    this.reportsPage = 1;
    this.logPage = 1;
    this.loadTab();
  }

  moderatePost(id: string, action: string): void {
    this.confirmAction = { type: `post_${action}`, id, label: `post_${action}` };
  }

  moderateComment(id: string, action: string): void {
    this.confirmAction = { type: `comment_${action}`, id, label: `comment_${action}` };
  }

  updateReportStatus(id: string, status: string): void {
    this.confirmAction = { type: `report_${status}`, id, label: `report_${status}` };
  }

  executeConfirm(): void {
    if (!this.confirmAction) return;
    const { type, id } = this.confirmAction;
    const parts = type.split('_');
    const target = parts[0];
    const action = parts[1];

    if (target === 'post') {
      this.api.put<any>(`community/posts/${id}/moderate`, { action }).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.loadPosts();
          this.loadStats();
          this.confirmAction = null;
        },
        error: () => { this.confirmAction = null; },
      });
    } else if (target === 'comment') {
      this.api.put<any>(`community/comments/${id}/moderate`, { action }).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.loadComments();
          this.loadStats();
          this.confirmAction = null;
        },
        error: () => { this.confirmAction = null; },
      });
    } else if (target === 'report') {
      this.api.put<any>(`community/reports/${id}/status`, { status: action }).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.loadReports();
          this.loadStats();
          this.confirmAction = null;
        },
        error: () => { this.confirmAction = null; },
      });
    }
  }

  cancelConfirm(): void {
    this.confirmAction = null;
  }

  nextPage(): void {
    switch (this.activeTab) {
      case 'posts': this.postsPage++; this.loadPosts(); break;
      case 'comments': this.commentsPage++; this.loadComments(); break;
      case 'reports': this.reportsPage++; this.loadReports(); break;
      case 'log': this.logPage++; this.loadLog(); break;
    }
  }

  prevPage(): void {
    switch (this.activeTab) {
      case 'posts': if (this.postsPage > 1) { this.postsPage--; this.loadPosts(); } break;
      case 'comments': if (this.commentsPage > 1) { this.commentsPage--; this.loadComments(); } break;
      case 'reports': if (this.reportsPage > 1) { this.reportsPage--; this.loadReports(); } break;
      case 'log': if (this.logPage > 1) { this.logPage--; this.loadLog(); } break;
    }
  }

  get currentPage(): number {
    switch (this.activeTab) {
      case 'posts': return this.postsPage;
      case 'comments': return this.commentsPage;
      case 'reports': return this.reportsPage;
      case 'log': return this.logPage;
    }
  }

  get currentTotal(): number {
    switch (this.activeTab) {
      case 'posts': return this.postsTotal;
      case 'comments': return this.commentsTotal;
      case 'reports': return this.reportsTotal;
      case 'log': return this.logTotal;
    }
  }

  get hasMore(): boolean {
    return this.currentPage * this.pageSize < this.currentTotal;
  }

  get totalPages(): number {
    return Math.ceil(this.currentTotal / this.pageSize) || 1;
  }

  statusBadge(status: string): string {
    const map: Record<string, string> = {
      active: 'badge-green', hidden: 'badge-yellow', removed: 'badge-red',
      pending: 'badge-yellow', actioned: 'badge-blue', dismissed: 'badge-gray',
      deleted: 'badge-red',
    };
    return map[status] || 'badge-gray';
  }

  formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleString();
  }

  truncate(text: string, len: number = 80): string {
    if (!text) return '';
    return text.length > len ? text.substring(0, len) + '...' : text;
  }

  t(key: string): string {
    return this.translate.instant(key);
  }
}
