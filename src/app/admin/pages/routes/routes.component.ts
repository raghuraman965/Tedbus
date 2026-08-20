import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';
import { RouteDialogComponent } from './route-dialog.component';

@Component({
  selector: 'app-admin-routes',
  templateUrl: './routes.component.html',
  styleUrls: ['./routes.component.css'],
})
export class AdminRoutesComponent implements OnInit, OnDestroy {
  items: any[] = [];
  loading = true;
  error = '';
  search = '';
  page = 1;
  limit = 20;
  total = 0;
  totalPages = 1;
  private destroy$ = new Subject<void>();

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private translate: TranslateService,
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
      .get<any>('routes', {
        search: this.search,
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
          this.error = 'admin.routes.loadError';
        },
      });
  }

  onSearch(): void {
    this.page = 1;
    this.load();
  }

  pageChange(p: number): void {
    this.page = p;
    this.load();
  }

  openDialog(route?: any): void {
    const ref = this.dialog.open(RouteDialogComponent, {
      width: '620px',
      data: { route },
      disableClose: true,
    });
    ref.afterClosed().subscribe((result) => {
      if (result) this.load();
    });
  }

  deleteRoute(r: any): void {
    if (!confirm(this.translate.instant('admin.routes.deleteConfirm'))) return;
    this.api
      .delete<any>(`routes/${r._id || r.id}`)
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

  toggleActive(r: any): void {
    this.api
      .put<any>(`routes/${r._id || r.id}`, { isActive: !r.isActive })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          r.isActive = !r.isActive;
          this.snack.open(this.translate.instant('admin.common.success'), '', { duration: 2000 });
        },
        error: () => {
          this.snack.open(this.translate.instant('admin.common.error'), '', { duration: 3000 });
        },
      });
  }

  srcDst(r: any): string {
    const src = r.departureLocation?.name || r.sourceName || '-';
    const dst = r.arrivalLocation?.name || r.destinationName || '-';
    return src + ' \u2192 ' + dst;
  }

  fare(r: any): string {
    return this.lang.formatCurrency(r.fareConfig?.baseFare || r.baseFare || 0);
  }

  stopsCount(r: any): number {
    return r.stops?.length || 0;
  }
}
