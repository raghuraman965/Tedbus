import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class AdminReportsComponent implements OnInit, OnDestroy {
  loading = true;
  error = false;
  private destroy$ = new Subject<void>();
  data: any = {
    bookingsByDay: [],
    revenueByRoute: [],
    topRoutes: [],
    busOccupancy: [],
    statusBreakdown: [],
    monthlyRevenue: [],
  };

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadAnalytics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAnalytics(): void {
    this.loading = true;
    this.error = false;
    this.api.get<any>('analytics').pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.data = res.data || res;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  retryLoad(): void {
    this.error = false;
    this.loadAnalytics();
  }

  maxDay(): number {
    return Math.max(1, ...this.data.bookingsByDay.map((d: any) => d.count || 0));
  }

  maxRev(): number {
    return Math.max(1, ...this.data.revenueByRoute.map((r: any) => r.revenue || 0));
  }

  barH(val: number, max: number): string {
    return Math.max(4, Math.round((val / max) * 100)) + '%';
  }

  totalRev(): number {
    return this.data.revenueByRoute.reduce((s: number, r: any) => s + (r.revenue || 0), 0);
  }

  fmt = (v: any): string => this.lang.formatCurrency(v);
  fmtN = (v: any): string => this.lang.formatNumber(v);

  statusColor(s: string): string {
    const map: Record<string, string> = {
      cancelled: '#ef4444',
      completed: '#22c55e',
      upcoming: '#f59e0b',
      confirmed: '#3b82f6',
      pending: '#f59e0b',
    };
    return map[s] || '#d84e55';
  }

  t(key: string): string {
    return this.translate.instant(key);
  }
}
