import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-bookings',
  templateUrl: './bookings.component.html',
  styleUrls: ['./bookings.component.css'],
})
export class AdminBookingsComponent implements OnInit, OnDestroy {
  items: any[] = [];
  loading = true;
  error = '';
  search = '';
  status = '';
  page = 1;
  limit = 20;
  total = 0;
  totalPages = 1;
  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  statuses = [
    'pending_payment',
    'payment_verified',
    'ticket_confirmed',
    'cancelled',
    'completed',
  ];

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
    private snack: MatSnackBar,
    private translate: TranslateService,
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
      .get<any>('bookings', {
        search: this.search,
        status: this.status,
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
          this.totalPages = d.totalPages || Math.ceil(this.total / this.limit) || 1;
        },
        error: () => {
          this.error = 'admin.bookings.loadError';
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

  pageChange(p: number): void {
    this.page = p;
    this.load();
  }

  cancelBooking(b: any): void {
    if (!confirm(this.translate.instant('admin.bookings.cancelConfirm'))) return;
    this.api
      .put<any>(`bookings/${b._id || b.id}/cancel`, {})
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(this.translate.instant('admin.common.success'), '', { duration: 3000 });
          this.load();
        },
        error: () => {
          this.snack.open(this.translate.instant('admin.common.error'), '', { duration: 3000 });
        },
      });
  }

  routeOf(b: any): string {
    if (b.routeName) return b.routeName;
    const r = b.route;
    if (r) return `${r.source || r.sourceName || '?'} → ${r.destination || r.destinationName || '?'}`;
    return '-';
  }

  idOf(b: any): string {
    const id = b._id || b.id || '';
    return String(id).slice(-8);
  }

  seatsOf(b: any): string {
    return b.seats ? String(b.seats) : b.seatCount ? String(b.seatCount) : '-';
  }

  statusCls(status: string): string {
    switch (status) {
      case 'ticket_confirmed':
      case 'completed':
        return 'st-ok';
      case 'cancelled':
        return 'st-err';
      case 'pending_payment':
        return 'st-warn';
      case 'payment_verified':
        return 'st-info';
      default:
        return '';
    }
  }

  fmt(v: number | null | undefined): string {
    return this.lang.formatCurrency(v);
  }

  fmtD(v: string | number | Date | null | undefined): string {
    return this.lang.formatDate(v);
  }
}
