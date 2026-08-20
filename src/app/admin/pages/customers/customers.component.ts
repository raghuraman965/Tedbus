import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.css'],
})
export class AdminCustomersComponent implements OnInit, OnDestroy {
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
    const params: any = {
      search: this.search,
      page: this.page,
      limit: this.limit,
    };
    if (this.statusFilter === 'active') {
      params.verified = 'true';
      params.suspended = 'false';
    } else if (this.statusFilter === 'suspended') {
      params.suspended = 'true';
    } else if (this.statusFilter === 'unverified') {
      params.verified = 'false';
    }
    this.api
      .get<any>('users', params)
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
          this.error = 'admin.customers.loadError';
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

  initials(u: any): string {
    return (u.name || u.email || '?').charAt(0).toUpperCase();
  }

  onImgError(u: any, ev: Event): void {
    (ev.target as HTMLImageElement).style.display = 'none';
    const next = (ev.target as HTMLElement).nextElementSibling;
    if (next) next.classList.remove('hidden');
  }

  toggleVerified(u: any): void {
    this.api
      .put<any>(`users/${u._id || u.id}/update`, { isVerified: !u.isVerified })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(this.translate.instant('admin.customers.verifiedToggled'), '', { duration: 3000 });
          this.load();
        },
        error: () => {
          this.snack.open(this.translate.instant('admin.customers.updateFailed'), '', { duration: 3000 });
        },
      });
  }

  toggleSuspend(u: any): void {
    this.api
      .put<any>(`users/${u._id || u.id}/update`, { isSuspended: !u.isSuspended })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(this.translate.instant('admin.customers.statusToggled'), '', { duration: 3000 });
          this.load();
        },
        error: () => {
          this.snack.open(this.translate.instant('admin.customers.updateFailed'), '', { duration: 3000 });
        },
      });
  }

  deleteUser(u: any): void {
    const msg = this.translate.instant('admin.customers.confirmDelete');
    if (!confirm(msg)) return;
    this.api
      .delete<any>(`users/${u._id || u.id}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snack.open(this.translate.instant('admin.customers.deleted'), '', { duration: 3000 });
          this.load();
        },
        error: () => {
          this.snack.open(this.translate.instant('admin.customers.deleteFailed'), '', { duration: 3000 });
        },
      });
  }
}
