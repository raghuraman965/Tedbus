import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ReviewService, Review, ReviewStats, EligibilityResponse } from '../../../service/review.service';
import { BusService } from '../../../service/bus.service';
import { AuthService } from '../../../Premium/services/auth.service';
import { effectiveTripStatus } from '../../../utils/booking-display';

interface CompletedJourney {
  bookingId: string;
  pnr: string;
  journeyDate: string;
  busLabel: string;
}

const REPORT_REASONS = ['spam', 'abuse', 'fake', 'harassment', 'other'];

@Component({
  selector: 'app-route-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatIconModule, MatButtonModule, MatSnackBarModule, MatTooltipModule],
  templateUrl: './route-reviews.component.html',
  styleUrls: ['./route-reviews.component.css']
})
export class RouteReviewsComponent implements OnInit, OnChanges {
  @Input() routeId!: string;
  @Input() busId: string = '';

  loading = true;
  loadError = false;
  reviews: Review[] = [];
  stats: ReviewStats = { avgRating: 0, totalReviews: 0, ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  page = 1;
  totalPages = 1;
  votedReviewIds: Set<string> = new Set();
  myReviewId: string | null = null;

  isLoggedIn = false;
  isVerifiedAccount = true;

  // Write-review flow
  showWriteForm = false;
  myJourneys: CompletedJourney[] = [];
  selectedBookingId = '';
  eligibility: EligibilityResponse | null = null;
  checkingEligibility = false;
  hoverRating = 0;
  formRating = 0;
  formTitle = '';
  formComment = '';
  submitting = false;
  formErrorKey = '';
  editingReview: Review | null = null;

  // Report flow
  reportingReviewId: string | null = null;
  reportReason = 'other';
  reportedIds: Set<string> = new Set();

  readonly minChars = 20;
  readonly maxChars = 2000;

  constructor(
    private reviewService: ReviewService,
    private busService: BusService,
    private authService: AuthService,
    private translate: TranslateService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn;
    this.loadReviews();
    if (this.isLoggedIn) {
      this.loadMyCompletedJourneys();
    }
  }

  ngOnChanges(): void {
    if (this.routeId) {
      this.loadReviews();
    }
  }

  loadReviews(): void {
    if (!this.routeId) return;
    this.loading = true;
    this.loadError = false;
    this.reviewService.getRouteReviews(this.routeId, this.page, 5).subscribe({
      next: (res) => {
        this.reviews = res.reviews;
        this.stats = res.stats;
        this.totalPages = Math.max(res.pagination.pages, 1);
        this.votedReviewIds = new Set(res.viewer?.votedReviewIds || []);
        this.myReviewId = res.viewer?.myReviewId || null;
        this.loading = false;
      },
      error: () => {
        this.loadError = true;
        this.loading = false;
      }
    });
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages && p !== this.page) {
      this.page = p;
      this.loadReviews();
    }
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  /** Completed journeys of the logged-in user on THIS route (client-side pre-filter). */
  private loadMyCompletedJourneys(): void {
    this.busService.getbusmongo('my').subscribe({
      next: (bookings: any[]) => {
        const list = Array.isArray(bookings) ? bookings : [];
        this.myJourneys = list
          .filter((b) => {
            const status = effectiveTripStatus(b);
            const paid = (b.paymentStatus || 'verified') === 'verified';
            return paid && status === 'completed' && !b.isDeleted;
          })
          .map((b) => ({
            bookingId: String(b._id),
            pnr: b.pnr || b.bookingId || '',
            journeyDate: (b.departureDetails && b.departureDetails.date) || '',
            busLabel: b.busName || b.operatorName || ''
          }));
      },
      error: () => {
        this.myJourneys = [];
      }
    });
  }

  toggleWriteForm(): void {
    this.showWriteForm = !this.showWriteForm;
    this.formErrorKey = '';
    if (this.showWriteForm && this.myJourneys.length > 0 && !this.selectedBookingId) {
      this.selectedBookingId = this.myJourneys[0].bookingId;
      this.checkEligibility();
    }
  }

  onBookingSelected(): void {
    this.eligibility = null;
    this.checkEligibility();
  }

  checkEligibility(): void {
    if (!this.selectedBookingId) return;
    this.checkingEligibility = true;
    this.reviewService.checkEligibility(this.selectedBookingId, this.routeId).subscribe({
      next: (res) => {
        this.eligibility = res;
        this.checkingEligibility = false;
        if (!res.eligible) this.formErrorKey = this.reasonKey(res.reason);
      },
      error: () => {
        this.checkingEligibility = false;
        this.formErrorKey = 'reviews.errors.generic';
      }
    });
  }

  reasonKey(reason: string | null | undefined): string {
    switch (reason) {
      case 'auth_required': return 'reviews.errors.authRequired';
      case 'unverified_account': return 'reviews.errors.unverifiedAccount';
      case 'booking_required':
      case 'booking_not_found': return 'reviews.errors.bookingRequired';
      case 'booking_not_owned': return 'reviews.errors.bookingNotOwned';
      case 'payment_not_verified': return 'reviews.errors.paymentNotVerified';
      case 'journey_not_completed': return 'reviews.errors.journeyNotCompleted';
      case 'route_mismatch': return 'reviews.errors.routeMismatch';
      case 'already_reviewed': return 'reviews.errors.alreadyReviewed';
      case 'edit_window_expired': return 'reviews.errors.editWindowExpired';
      case 'invalid_rating': return 'reviews.errors.ratingInteger';
      case 'comment_too_short': return 'reviews.errors.commentTooShort';
      case 'comment_too_long': return 'reviews.errors.commentTooLong';
      default: return 'reviews.errors.generic';
    }
  }

  setRating(n: number): void {
    this.formRating = n;
  }

  get commentLength(): number {
    return (this.formComment || '').trim().length;
  }

  canSubmit(): boolean {
    return (
      !!this.eligibility?.eligible &&
      this.formRating >= 1 &&
      this.formRating <= 5 &&
      this.commentLength >= this.minChars &&
      this.commentLength <= this.maxChars &&
      !this.submitting
    );
  }

  submitReview(): void {
    if (!this.canSubmit()) return;
    this.submitting = true;
    this.formErrorKey = '';

    const payload = {
      bookingId: this.selectedBookingId,
      routeId: this.routeId,
      rating: this.formRating,
      title: this.formTitle.trim(),
      comment: this.formComment.trim()
    };

    const request$ = this.editingReview?._id
      ? this.reviewService.updateReview(this.editingReview._id, {
          rating: payload.rating,
          title: payload.title,
          comment: payload.comment
        })
      : this.reviewService.createReview(payload);

    request$.subscribe({
      next: () => {
        this.submitting = false;
        this.resetForm();
        this.showWriteForm = false;
        this.snackBar.open(
          this.editingReview ? this.translate.instant('reviews.updated') : this.translate.instant('reviews.submitted'),
          this.translate.instant('common.ok'),
          { duration: 3000 }
        );
        this.page = 1;
        this.loadReviews();
      },
      error: (err) => {
        this.submitting = false;
        this.formErrorKey = err?.error?.reason
          ? this.reasonKey(err.error.reason)
          : 'reviews.errors.generic';
      }
    });
  }

  startEdit(review: Review): void {
    if (!this.canEditReview(review)) return;
    this.editingReview = review;
    this.showWriteForm = true;
    this.formRating = review.rating;
    this.formTitle = review.title || '';
    this.formComment = review.comment || '';
    this.eligibility = { eligible: true, reason: null };
  }

  cancelEdit(): void {
    this.resetForm();
    this.showWriteForm = false;
  }

  private resetForm(): void {
    this.editingReview = null;
    this.formRating = 0;
    this.hoverRating = 0;
    this.formTitle = '';
    this.formComment = '';
    this.formErrorKey = '';
  }

  canEditReview(review: Review): boolean {
    if (!review._id || review._id !== this.myReviewId) return false;
    if (!review.createdAt) return false;
    const hours = (Date.now() - new Date(review.createdAt).getTime()) / 3600000;
    return hours <= 24;
  }

  deleteMyReview(review: Review): void {
    if (!review._id) return;
    this.reviewService.deleteReview(review._id).subscribe({
      next: () => {
        this.myReviewId = null;
        this.snackBar.open(this.translate.instant('reviews.deleted'), this.translate.instant('common.ok'), { duration: 3000 });
        this.loadReviews();
      },
      error: () => {
        this.snackBar.open(this.translate.instant('reviews.errors.generic'), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  toggleHelpful(review: Review): void {
    if (!review._id || !this.isLoggedIn) return;
    this.reviewService.toggleHelpful(review._id).subscribe({
      next: (res) => {
        review.helpfulCount = res.helpfulCount;
        if (res.voted) this.votedReviewIds.add(review._id!);
        else this.votedReviewIds.delete(review._id!);
      },
      error: () => {}
    });
  }

  hasVoted(review: Review): boolean {
    return !!review._id && this.votedReviewIds.has(review._id);
  }

  toggleReportPanel(review: Review): void {
    this.reportingReviewId = this.reportingReviewId === review._id ? null : (review._id ?? null);
    this.reportReason = 'other';
  }

  submitReport(review: Review): void {
    if (!review._id || !REPORT_REASONS.includes(this.reportReason)) return;
    this.reviewService.reportReview(review._id, this.reportReason).subscribe({
      next: () => {
        this.reportingReviewId = null;
        this.reportedIds.add(review._id!);
        this.snackBar.open(this.translate.instant('reviews.reportedThanks'), this.translate.instant('common.ok'), { duration: 3000 });
      },
      error: (err) => {
        this.reportingReviewId = null;
        const key = err?.status === 409 ? 'reviews.alreadyReported' : 'reviews.errors.generic';
        this.snackBar.open(this.translate.instant(key), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  reportReasons(): string[] {
    return REPORT_REASONS;
  }

  authorName(review: Review): string {
    return review.author?.name || review.customerName || this.translate.instant('reviews.anonymous');
  }

  authorInitial(review: Review): string {
    return this.authorName(review).trim().charAt(0).toUpperCase() || 'T';
  }

  reviewDate(review: Review): string {
    if (!review.createdAt) return '';
    return new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  starsArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  breakdownPercent(star: number): number {
    const total = this.stats.totalReviews || 0;
    if (!total) return 0;
    return Math.round(((this.stats.ratingBreakdown[star] || 0) / total) * 100);
  }

  trackByReviewId(_i: number, review: Review): string {
    return review._id || '';
  }
}
