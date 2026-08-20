import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminLanguageService } from '../../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';

interface Offer {
  _id: string;
  title: string;
  description: string;
  code: string;
  discountPercent: number;
  discountAmount: number;
  minFare: number;
  maxDiscount: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  usageLimit: number;
  usedCount: number;
  targetAudience: string;
  imageUrl: string;
}

@Component({
  selector: 'app-admin-offers',
  templateUrl: './offers.component.html',
  styleUrls: ['./offers.component.css'],
})
export class AdminOffersComponent implements OnInit, OnDestroy {
  offers: Offer[] = [];
  loading = true;
  error = false;
  search = '';
  activeFilter: string = '';
  page = 1;
  limit = 10;
  total = 0;
  totalPages = 1;
  private destroy$ = new Subject<void>();

  showDialog = false;
  editingOffer: Offer | null = null;
  saving = false;
  form: any = this.emptyForm();
  confirmDeleteId: string | null = null;

  constructor(
    private api: AdminApiService,
    private lang: AdminLanguageService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadOffers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  emptyForm(): any {
    return {
      title: '',
      description: '',
      code: '',
      discountPercent: 0,
      discountAmount: 0,
      minFare: 0,
      maxDiscount: 0,
      validFrom: '',
      validTo: '',
      isActive: true,
      usageLimit: 0,
      usedCount: 0,
      targetAudience: 'all',
      imageUrl: '',
    };
  }

  loadOffers(): void {
    this.loading = true;
    this.error = false;
    const params: any = { page: this.page, limit: this.limit };
    if (this.search) params.search = this.search;
    if (this.activeFilter !== '') params.isActive = this.activeFilter;
    this.api.get<any>('offers', params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const d = res.data || res;
        this.offers = d.items || [];
        this.total = d.total || 0;
        this.totalPages = Math.max(1, Math.ceil(this.total / this.limit));
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = true; },
    });
  }

  retryLoad(): void {
    this.error = false;
    this.loadOffers();
  }

  onSearch(): void {
    this.page = 1;
    this.loadOffers();
  }

  filterActive(val: string): void {
    this.activeFilter = val;
    this.page = 1;
    this.loadOffers();
  }

  nextPage(): void {
    if (this.page < this.totalPages) { this.page++; this.loadOffers(); }
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadOffers(); }
  }

  openCreate(): void {
    this.editingOffer = null;
    this.form = this.emptyForm();
    this.showDialog = true;
  }

  openEdit(offer: Offer): void {
    this.editingOffer = offer;
    this.form = { ...offer };
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
    this.editingOffer = null;
  }

  save(): void {
    this.saving = true;
    if (this.editingOffer) {
      this.api.put<any>('offers/' + this.editingOffer._id, this.form).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.saving = false; this.closeDialog(); this.loadOffers(); },
        error: () => { this.saving = false; },
      });
    } else {
      this.api.post<any>('offers', this.form).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.saving = false; this.closeDialog(); this.loadOffers(); },
        error: () => { this.saving = false; },
      });
    }
  }

  toggleActive(offer: Offer): void {
    this.api.put<any>('offers/' + offer._id + '/toggle', {}).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadOffers(),
    });
  }

  promptDelete(id: string): void {
    this.confirmDeleteId = id;
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
  }

  confirmDelete(): void {
    if (!this.confirmDeleteId) return;
    this.api.delete<any>('offers/' + this.confirmDeleteId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.confirmDeleteId = null; this.loadOffers(); },
      error: () => { this.confirmDeleteId = null; },
    });
  }

  fmtDate(d: string): string {
    if (!d) return '—';
    return this.lang.formatDate(new Date(d));
  }

  fmtDiscount(o: Offer): string {
    if (o.discountPercent > 0) return o.discountPercent + '%';
    if (o.discountAmount > 0) return this.lang.formatCurrency(o.discountAmount);
    return '—';
  }

  t(key: string): string {
    return this.translate.instant(key);
  }
}
