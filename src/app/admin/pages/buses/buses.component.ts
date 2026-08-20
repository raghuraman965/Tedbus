import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';
import { BusDialogComponent } from './bus-dialog.component';

@Component({
  selector: 'app-admin-buses',
  templateUrl: './buses.component.html',
  styleUrls: ['./buses.component.css'],
})
export class AdminBusesComponent implements OnInit, OnDestroy {
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
      .get<any>('buses', {
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
          this.error = 'admin.buses.loadError';
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

  openDialog(bus?: any): void {
    const ref = this.dialog.open(BusDialogComponent, {
      width: '520px',
      data: { bus },
      disableClose: true,
    });
    ref.afterClosed().subscribe((result) => {
      if (result) this.load();
    });
  }

  deleteBus(bus: any): void {
    if (!confirm(this.translate.instant('admin.buses.deleteConfirm'))) return;
    this.api
      .delete<any>(`buses/${bus._id || bus.id}`)
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

  avgRating(bus: any): string {
    const r = bus.avgRating || bus.rating || 0;
    return r ? Number(r).toFixed(1) : '-';
  }

  departureLabel(bus: any): string {
    return bus.departureTime || bus.departure || '-';
  }

  initials(name: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
