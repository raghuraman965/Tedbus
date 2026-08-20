import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';

@Component({
  selector: 'app-admin-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css'],
})
export class AdminNotificationsComponent implements OnInit, OnDestroy {
  items: any[] = [];
  loading = true;
  error = '';
  search = '';
  categoryFilter = '';
  page = 1;
  limit = 20;
  total = 0;
  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  stats: { total: number; unread: number; byCategory: Record<string, number> } = {
    total: 0,
    unread: 0,
    byCategory: {},
  };

  categories = [
    { value: '', labelKey: 'admin.notifications.allCategories' },
    { value: 'booking', labelKey: 'admin.notifications.catBooking' },
    { value: 'cancellation', labelKey: 'admin.notifications.catCancellation' },
    { value: 'payment', labelKey: 'admin.notifications.catPayment' },
    { value: 'journey', labelKey: 'admin.notifications.catJourney' },
    { value: 'bus', labelKey: 'admin.notifications.catBus' },
    { value: 'offer', labelKey: 'admin.notifications.catOffer' },
    { value: 'security', labelKey: 'admin.notifications.catSecurity' },
    { value: 'system', labelKey: 'admin.notifications.catSystem' },
  ];

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
  ) {}

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.page = 1;
        this.load();
      });
    this.loadStats();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStats(): void {
    this.api
      .get<any>('notifications/stats')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const d = res.data || res;
          this.stats = { total: d.total || 0, unread: d.unread || 0, byCategory: d.byCategory || {} };
        },
        error: () => {},
      });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api
      .get<any>('notifications', {
        search: this.search,
        category: this.categoryFilter,
        page: this.page,
        limit: this.limit,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (res) => {
          this.items = res.items || [];
          this.total = res.total || 0;
        },
        error: () => {
          this.error = 'admin.notifications.loadError';
        },
      });
  }

  onSearchInput(): void {
    this.search$.next(this.search);
  }

  onFilter(): void {
    this.page = 1;
    this.load();
  }

  pageChange(n: number): void {
    if (n >= 1 && n <= this.totalPages) {
      this.page = n;
      this.load();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  fmtD(v: any): string {
    return this.lang.formatDate(v);
  }

  channelStatus(n: any, ch: string): string {
    const c = n.channels?.[ch];
    if (!c) return 'none';
    if (typeof c === 'boolean') return c ? 'sent' : 'none';
    return c.status || 'none';
  }

  truncate(s: string, len: number = 80): string {
    if (!s) return '—';
    return s.length > len ? s.slice(0, len) + '…' : s;
  }

  priorityCls(p: string): string {
    if (['critical', 'high'].includes(p)) return 'st-err';
    if (p === 'medium') return 'st-warn';
    return 'st-info';
  }
}
