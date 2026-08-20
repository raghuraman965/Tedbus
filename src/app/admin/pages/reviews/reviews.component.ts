import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'app-admin-reviews',
  templateUrl: './reviews.component.html',
  styleUrls: ['./reviews.component.css']
})
export class AdminReviewsComponent implements OnInit {
  reviews: any[] = [];
  loading = true;
  page = 1;
  limit = 20;
  total = 0;
  pages = 0;
  filterVisible: string = '';
  filterBusId: string = '';

  constructor(
    private api: AdminApiService,
    private snackBar: MatSnackBar,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: Record<string, any> = { page: this.page, limit: this.limit };
    if (this.filterVisible) params['visible'] = this.filterVisible;
    if (this.filterBusId.trim()) params['busId'] = this.filterBusId.trim();
    this.api.get<any>('reviews', params).subscribe({
      next: (res) => {
        this.reviews = (res.data?.items) || [];
        this.total = res.data?.total || 0;
        this.pages = Math.ceil(this.total / this.limit) || 0;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open(
          this.translate.instant('admin.errReviews'),
          this.translate.instant('common.ok'),
          { duration: 3000 }
        );
      }
    });
  }

  toggleVisibility(review: any): void {
    this.api.put<any>('reviews/' + review._id + '/status', { visible: !review.visible }).subscribe({
      next: (res) => {
        if (res.ok) { review.visible = !review.visible; }
        this.snackBar.open(
          this.translate.instant('admin.reviewUpdated'),
          this.translate.instant('common.ok'),
          { duration: 2000 }
        );
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('admin.errUpdateReview'),
          this.translate.instant('common.ok'),
          { duration: 3000 }
        );
      }
    });
  }

  deleteReview(review: any): void {
    if (!confirm(this.translate.instant('admin.confirmDelete'))) return;
    this.api.delete<any>('reviews/' + review._id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r._id !== review._id);
        this.total--;
        this.snackBar.open(
          this.translate.instant('admin.reviewDeleted'),
          this.translate.instant('common.ok'),
          { duration: 2000 }
        );
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('admin.errDeleteReview'),
          this.translate.instant('common.ok'),
          { duration: 3000 }
        );
      }
    });
  }

  nextPage(): void {
    if (this.page < this.pages) { this.page++; this.load(); }
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.load(); }
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }
}
