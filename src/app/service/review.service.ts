import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../config';
import { AuthService } from '../Premium/services/auth.service';

export interface Review {
  _id?: string;
  busId: string;
  customerId: string;
  bookingId?: string;
  customerName: string;
  title: string;
  rating: number;
  comment: string;
  photos: string[];
  visible: boolean;
  createdAt?: string;
  updatedAt?: string;
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

  getReviews(busId: string, page = 1, limit = 20): Observable<ReviewListResponse> {
    return this.http.get<ReviewListResponse>(this.base + 'reviews/' + busId, {
      params: { page: String(page), limit: String(limit) }
    });
  }

  createReview(data: Partial<Review> & { bookingId?: string }): Observable<{ review: Review }> {
    return this.http.post<{ review: Review }>(this.base + 'reviews', data, {
      headers: this.authHeaders()
    });
  }

  updateReview(id: string, data: Partial<Review>): Observable<{ review: Review }> {
    return this.http.put<{ review: Review }>(this.base + 'reviews/' + id, data, {
      headers: this.authHeaders()
    });
  }

  deleteReview(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.base + 'reviews/' + id, {
      headers: this.authHeaders()
    });
  }

  myReviews(): Observable<{ reviews: Review[] }> {
    return this.http.get<{ reviews: Review[] }>(this.base + 'reviews/user/me', {
      headers: this.authHeaders()
    });
  }
}
