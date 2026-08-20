import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  stats: any = null;
  loading = true;
  error = '';
  private destroy$ = new Subject<void>();

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
  ) {}

  ngOnInit(): void {
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
      .get<any>('dashboard/stats')
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (res) => {
          this.stats = res.data || res;
        },
        error: () => {
          this.error = 'admin.dashboard.loadError';
        },
      });
  }

  fmt(v: number | null | undefined): string {
    return this.lang.formatCurrency(v);
  }

  fmtN(v: number | null | undefined): string {
    return this.lang.formatNumber(v);
  }

  fmtD(v: string | number | Date | null | undefined): string {
    return this.lang.formatDate(v);
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
}
