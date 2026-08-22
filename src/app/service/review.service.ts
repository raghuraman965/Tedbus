import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../config';
import { AuthService } from '../Premium/services/auth.service';

export interface ReviewAuthor {
  name: string;
  photo: string;
  isVerified: boolean;
  trustedReviewer: boolean;
}

export interface Review {
  _id?: string;
  busId?: string;
  routeId?: string | null;
  customerId?: string;
  bookingId?: string;
  journeyDate?: string;
  customerName?: string;
  title: string;
  rating: number;
  comment: string;
  photos: string[];
  visible?: boolean;
  status?: 'visible' | 'hidden' | 'removed';
  isEdited?: boolean;
  editedAt?: string | null;
  helpfulCount?: number;
  reportCount?: number;
  createdAt?: string;
  updatedAt?: string;
  author?: ReviewAuthor;
}

export interface ReviewStats {
  avgRating: number;
  totalReviews: number;
  ratingBreakdown: Record<number, number>;
}

export interface ReviewListResponse {
  reviews: Review[];
  pagination: { page: number; limit: number; total: number; pages: number };
  stats: ReviewStats;
  viewer?: { votedReviewIds: string[]; myReviewId: string | null } | null;
}

export type ReviewEligibilityReason =
  | 'auth_required'
  | 'unverified_account'
  | 'booking_required'
  | 'booking_not_found'
  | 'booking_not_owned'
  | 'payment_not_verified'
  | 'journey_not_completed'
  | 'route_mismatch'
  | 'already_reviewed'
  | 'booking_cancelled';

export interface EligibilityResponse {
  eligible: boolean;
  reason: ReviewEligibilityReason | null;
  booking?: {
    _id: string;
    pnr: string;
    journeyDate: string;
    arrivalDate: string;
  };
  routeId?: string;
  busId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private base = url + 'api/';

  constructor(private http: HttpClient, private authService: AuthService) {}

  private authHeaders(): HttpHeaders {
    const token = this.authService.token;
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  /** Route-scoped reviews + stats (primary Task 6 surface). */
  getRouteReviews(routeId: string, page = 1, limit = 10): Observable<ReviewListResponse> {
    return this.http.get<ReviewListResponse>(this.base + 'reviews/route/' + routeId, {
      params: { page: String(page), limit: String(limit) }
    });
  }

  /** Bus-scoped reviews + stats (legacy/compat). */
  getReviews(busId: string, page = 1, limit = 20): Observable<ReviewListResponse> {
    return this.http.get<ReviewListResponse>(this.base + 'reviews/bus/' + busId, {
      params: { page: String(page), limit: String(limit) }
    });
  }

  /** Can the logged-in user review this completed booking? */
  checkEligibility(bookingId: string, routeId?: string): Observable<EligibilityResponse> {
    const params: Record<string, string> = { bookingId };
    if (routeId) params['routeId'] = routeId;
    return this.http.get<EligibilityResponse>(this.base + 'reviews/eligibility', {
      params,
      headers: this.authHeaders()
    });
  }

  createReview(data: Partial<Review> & { bookingId: string }): Observable<{ review: Review; stats: ReviewStats }> {
    return this.http.post<{ review: Review; stats: ReviewStats }>(this.base + 'reviews', data, {
      headers: this.authHeaders()
    });
  }

  updateReview(id: string, data: Partial<Review>): Observable<{ review: Review; stats: ReviewStats }> {
    return this.http.put<{ review: Review; stats: ReviewStats }>(this.base + 'reviews/' + id, data, {
      headers: this.authHeaders()
    });
  }

  deleteReview(id: string): Observable<{ message: string; stats?: ReviewStats }> {
    return this.http.delete<{ message: string; stats?: ReviewStats }>(this.base + 'reviews/' + id, {
      headers: this.authHeaders()
    });
  }

  reportReview(id: string, reason: string): Observable<{ message: string; reportCount: number; hidden: boolean }> {
    return this.http.post<{ message: string; reportCount: number; hidden: boolean }>(
      this.base + 'reviews/' + id + '/report',
      { reason },
      { headers: this.authHeaders() }
    );
  }

  toggleHelpful(id: string): Observable<{ helpfulCount: number; voted: boolean }> {
    return this.http.post<{ helpfulCount: number; voted: boolean }>(
      this.base + 'reviews/' + id + '/helpful',
      {},
      { headers: this.authHeaders() }
    );
  }

  myReviews(): Observable<{
    reviews: (Review & { canEdit: boolean; bus?: { _id: string; name: string; number: string } | null; route?: { _id: string; source: string; destination: string } | null })[];
    helpfulScore: number;
    trustedReviewer: boolean;
  }> {
    return this.http.get<{
      reviews: (Review & { canEdit: boolean; bus?: { _id: string; name: string; number: string } | null; route?: { _id: string; source: string; destination: string } | null })[];
      helpfulScore: number;
      trustedReviewer: boolean;
    }>(this.base + 'reviews/user/me', {
      headers: this.authHeaders()
    });
  }
}
