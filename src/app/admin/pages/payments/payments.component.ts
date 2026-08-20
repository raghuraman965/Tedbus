import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';

@Component({
  selector: 'app-admin-payments',
  templateUrl: './payments.component.html',
  styleUrls: ['./payments.component.css'],
})
export class AdminPaymentsComponent implements OnInit, OnDestroy {
  items: any[] = [];
  loading = true;
  error = '';
  search = '';
  statusFilter = '';
  page = 1;
  limit = 15;
  total = 0;
  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

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
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api
      .get<any>('payments', {
        search: this.search,
        status: this.statusFilter,
        page: this.page,
        limit: this.limit,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (res) => {
          const d = res.data || res;
          this.items = d.items || [];
          this.total = d.total || 0;
        },
        error: () => {
          this.error = 'admin.payments.loadError';
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

  fmt(v: any): string {
    return this.lang.formatCurrency(v);
  }

  fmtD(v: any): string {
    return this.lang.formatDate(v);
  }

  paymentStatusCls(status: string): string {
    if (['completed', 'success', 'paid'].includes(status)) return 'st-ok';
    if (['failed', 'error'].includes(status)) return 'st-err';
    if (['pending', 'processing'].includes(status)) return 'st-warn';
    if (status === 'refunded') return 'st-info';
    return 'st-info';
  }

  refundStatus(p: any): string {
    if (p.status === 'refunded') return 'admin.payments.refunded';
    if (p.status === 'cancelled' && p.paymentStatus === 'refunded') return 'admin.payments.refunded';
    if (p.status === 'cancelled' && p.paymentStatus !== 'refunded') return 'admin.payments.pendingRefund';
    return '';
  }

  methodCls(m: string): string {
    if (!m) return 'st-info';
    const lower = m.toLowerCase();
    if (lower.includes('card') || lower.includes('credit') || lower.includes('debit')) return 'st-info';
    if (lower.includes('wallet') || lower.includes('upi')) return 'st-ok';
    if (lower.includes('net') || lower.includes('bank')) return 'st-warn';
    return 'muted-badge';
  }
}
