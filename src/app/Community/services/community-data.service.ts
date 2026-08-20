import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { url } from '../../config';
import { AuthService } from '../../Premium/services/auth.service';
import {
  CommunityPost,
  CommunityUser,
  TrendingRoute,
  PopularDestination,
  TopContributor,
  Category,
  PostsPage,
  FilterOptions,
  Hashtag,
  SearchResults,
  CommunityNotification,
  NotificationsPage,
  RecentReport,
  ReportedUser,
  CommunityStats,
  FollowResponse
} from '../models/community.model';

@Injectable({
  providedIn: 'root'
})
export class CommunityDataService {
  private apiUrl = url + 'community/';

  // Fixed taxonomy, not user-generated content, so this stays as a simple
  // static list (matches how "categories" work on most travel platforms).
  categories: Category[] = [
    { name: 'Bus Reviews', nameKey: 'community.categoryNames.bus_reviews', icon: 'directions_bus' },
    { name: 'Travel Stories', nameKey: 'community.categoryNames.travel_stories', icon: 'auto_stories' },
    { name: 'Food Stops', nameKey: 'community.categoryNames.food_stops', icon: 'restaurant' },
    { name: 'Hidden Places', nameKey: 'community.categoryNames.hidden_places', icon: 'explore' },
    { name: 'Night Travel', nameKey: 'community.categoryNames.night_travel', icon: 'nightlight' },
    { name: 'Women Safety', nameKey: 'community.categoryNames.women_safety', icon: 'shield' },
    { name: 'Budget Trips', nameKey: 'community.categoryNames.budget_trips', icon: 'savings' },
    { name: 'Luxury Trips', nameKey: 'community.categoryNames.luxury_trips', icon: 'diamond' },
    { name: 'Pilgrimage', nameKey: 'community.categoryNames.pilgrimage', icon: 'temple_hindu' },
    { name: 'Hill Stations', nameKey: 'community.categoryNames.hill_stations', icon: 'landscape' },
    { name: 'Beach Destinations', nameKey: 'community.categoryNames.beach_destinations', icon: 'beach_access' }
  ];

  constructor(private http: HttpClient, private authService: AuthService, private translate: TranslateService) { }

  private get currentUserId(): string | null {
    return this.authService.currentUser?._id || null;
  }

  /** Builds the Authorization header for JWT-protected endpoints. */
  private authHeaders(): HttpHeaders {
    const token = this.authService.token;
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  get isCurrentUserAdmin(): boolean {
    return this.authService.currentUser?.isAdmin === true;
  }

  private withUserParam(): string {
    return this.currentUserId ? `?userId=${this.currentUserId}` : '';
  }

  getCategories(): Category[] {
    return this.categories;
  }

  getCurrentUser(): CommunityUser | null {
    const user = this.authService.currentUser;
    if (!user) return null;
    const initials = (user.name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return {
      id: user._id,
      name: user.name,
      avatar: user.profilePicture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=D84E55`,
      verified: this.isCurrentUserVerified
    };
  }

  /** Matches the exact rule the backend enforces on post creation:
   *  Google accounts are verified automatically; email accounts need the
   *  admin dashboard's "Approve verification" action. */
  get isCurrentUserVerified(): boolean {
    const user = this.authService.currentUser;
    return !!user && (user.authProvider === 'google' || (user as any).isVerified === true);
  }

  // ===================== IMAGE UPLOAD =====================

  uploadImage(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ url: string }>(this.apiUrl + 'upload', formData, {
      headers: this.authHeaders()
    });
  }

  // ===================== POSTS =====================

  getPosts(options: { page?: number; limit?: number; category?: string; route?: string; destination?: string; search?: string; authorId?: string; hashtag?: string; likedByMe?: boolean; bookmarkedByMe?: boolean; sort?: string } = {}): Observable<PostsPage> {
    const params: string[] = [];
    if (this.currentUserId) params.push(`userId=${this.currentUserId}`);
    if (options.page) params.push(`page=${options.page}`);
    if (options.limit) params.push(`limit=${options.limit}`);
    if (options.category) params.push(`category=${encodeURIComponent(options.category)}`);
    if (options.route) params.push(`route=${encodeURIComponent(options.route)}`);
    if (options.destination) params.push(`destination=${encodeURIComponent(options.destination)}`);
    if (options.search) params.push(`search=${encodeURIComponent(options.search)}`);
    if (options.authorId) params.push(`authorId=${encodeURIComponent(options.authorId)}`);
    if (options.hashtag) params.push(`hashtag=${encodeURIComponent(options.hashtag)}`);
    if (options.likedByMe) params.push(`likedByMe=true`);
    if (options.bookmarkedByMe) params.push(`bookmarkedByMe=true`);
    if (options.sort) params.push(`sort=${options.sort}`);
    const query = params.length ? '?' + params.join('&') : '';
    return this.http.get<PostsPage>(this.apiUrl + 'posts' + query);
  }

  getFilterOptions(): Observable<FilterOptions> {
    return this.http.get<FilterOptions>(this.apiUrl + 'filter-options');
  }

  getPostById(id: string): Observable<CommunityPost> {
    return this.http.get<CommunityPost>(this.apiUrl + 'posts/' + id + this.withUserParam());
  }

  getRelatedPosts(id: string): Observable<CommunityPost[]> {
    return this.http.get<CommunityPost[]>(this.apiUrl + 'posts/' + id + '/related' + this.withUserParam());
  }

  createPost(post: {
    title: string; story: string; route: string; destination: string;
    travelDate: string; images: string[]; tips: string[]; tags: string[]; category: string;
  }): Observable<CommunityPost> {
    if (!this.currentUserId) {
      return throwError(() => new Error(this.translate.instant('community.errors.loginRequiredPost')));
    }
    return this.http.post<CommunityPost>(this.apiUrl + 'posts', post, { headers: this.authHeaders() });
  }

  toggleLike(postId: string): Observable<{ likes: number; liked: boolean }> {
    return this.http.post<{ likes: number; liked: boolean }>(
      this.apiUrl + 'posts/' + postId + '/like', {}, { headers: this.authHeaders() }
    );
  }

  toggleBookmark(postId: string): Observable<{ bookmarked: boolean }> {
    return this.http.post<{ bookmarked: boolean }>(
      this.apiUrl + 'posts/' + postId + '/bookmark', {}, { headers: this.authHeaders() }
    );
  }

  incrementShare(postId: string): Observable<{ shares: number }> {
    return this.http.post<{ shares: number }>(this.apiUrl + 'posts/' + postId + '/share', {});
  }

  reportPost(postId: string, reason: string, details?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.apiUrl + 'posts/' + postId + '/report',
      { reason, details: details || '' },
      { headers: this.authHeaders() }
    );
  }

  deletePost(postId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.apiUrl + 'posts/' + postId, {
      headers: this.authHeaders()
    });
  }

  // ===================== COMMENTS =====================

  addComment(postId: string, content: string, parentCommentId?: string): Observable<CommunityPost> {
    if (!this.currentUserId) {
      return throwError(() => new Error(this.translate.instant('community.errors.loginRequiredComment')));
    }
    return this.http.post<CommunityPost>(this.apiUrl + 'posts/' + postId + '/comments', {
      content, parentCommentId
    }, { headers: this.authHeaders() });
  }

  toggleLikeComment(commentId: string): Observable<{ likes: number; liked: boolean }> {
    return this.http.post<{ likes: number; liked: boolean }>(
      this.apiUrl + 'comments/' + commentId + '/like', {}, { headers: this.authHeaders() }
    );
  }

  editComment(commentId: string, content: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.apiUrl + 'comments/' + commentId, {
      content
    }, { headers: this.authHeaders() });
  }

  deleteComment(commentId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.apiUrl + 'comments/' + commentId, {
      headers: this.authHeaders()
    });
  }

  // ===================== SEARCH & DISCOVERY =====================

  search(q: string): Observable<SearchResults> {
    const userIdParam = this.currentUserId ? `&userId=${this.currentUserId}` : '';
    return this.http.get<SearchResults>(this.apiUrl + 'search?q=' + encodeURIComponent(q) + userIdParam);
  }

  getTrendingHashtags(): Observable<Hashtag[]> {
    return this.http.get<Hashtag[]>(this.apiUrl + 'hashtags/trending');
  }

  // ===================== FOLLOW SYSTEM =====================

  getSuggestedUsers(): Observable<CommunityUser[]> {
    return this.http.get<CommunityUser[]>(this.apiUrl + 'users/suggested', { headers: this.authHeaders() });
  }

  getUserProfile(id: string): Observable<CommunityUser> {
    return this.http.get<CommunityUser>(this.apiUrl + 'users/' + id + this.withUserParam());
  }

  getFollowers(id: string): Observable<CommunityUser[]> {
    return this.http.get<CommunityUser[]>(this.apiUrl + 'users/' + id + '/followers' + this.withUserParam());
  }

  getFollowing(id: string): Observable<CommunityUser[]> {
    return this.http.get<CommunityUser[]>(this.apiUrl + 'users/' + id + '/following');
  }

  followUser(id: string): Observable<FollowResponse> {
    return this.http.post<FollowResponse>(this.apiUrl + 'users/' + id + '/follow', {}, { headers: this.authHeaders() });
  }

  unfollowUser(id: string): Observable<FollowResponse> {
    return this.http.post<FollowResponse>(this.apiUrl + 'users/' + id + '/unfollow', {}, { headers: this.authHeaders() });
  }

  getMyProfile(): Observable<CommunityUser & { email: string; isAdmin: boolean }> {
    return this.http.get<CommunityUser & { email: string; isAdmin: boolean }>(this.apiUrl + 'me', {
      headers: this.authHeaders()
    });
  }

  updateMyProfile(data: { name?: string; bio?: string; location?: string; profilePicture?: string; coverImage?: string }): Observable<CommunityUser & { email: string }> {
    return this.http.put<CommunityUser & { email: string }>(this.apiUrl + 'me', data, {
      headers: this.authHeaders()
    });
  }

  // ===================== NOTIFICATIONS =====================

  getNotifications(page: number = 1, limit: number = 15): Observable<NotificationsPage> {
    return this.http.get<NotificationsPage>(
      this.apiUrl + 'notifications?page=' + page + '&limit=' + limit,
      { headers: this.authHeaders() }
    );
  }

  getUnreadNotificationCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(this.apiUrl + 'notifications/unread-count', {
      headers: this.authHeaders()
    });
  }

  markNotificationRead(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + 'notifications/' + id + '/read', {}, {
      headers: this.authHeaders()
    });
  }

  markAllNotificationsRead(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + 'notifications/read-all', {}, {
      headers: this.authHeaders()
    });
  }

  // ===================== AGGREGATED STATS =====================

  getTrendingRoutes(): Observable<TrendingRoute[]> {
    return this.http.get<TrendingRoute[]>(this.apiUrl + 'stats/trending-routes');
  }

  getPopularDestinations(): Observable<PopularDestination[]> {
    return this.http.get<PopularDestination[]>(this.apiUrl + 'stats/popular-destinations');
  }

  getTopContributors(): Observable<TopContributor[]> {
    return this.http.get<TopContributor[]>(this.apiUrl + 'stats/top-contributors');
  }

  // ===================== ADMIN MODERATION =====================

  getReportedPosts(): Observable<CommunityPost[]> {
    return this.http.get<CommunityPost[]>(this.apiUrl + 'admin/reported-posts', { headers: this.authHeaders() });
  }

  getRecentReports(): Observable<RecentReport[]> {
    return this.http.get<RecentReport[]>(this.apiUrl + 'admin/reports', { headers: this.authHeaders() });
  }

  getReportedUsers(): Observable<ReportedUser[]> {
    return this.http.get<ReportedUser[]>(this.apiUrl + 'admin/reported-users', { headers: this.authHeaders() });
  }

  getUnverifiedUsers(): Observable<(CommunityUser & { email: string; provider: string })[]> {
    return this.http.get<(CommunityUser & { email: string; provider: string })[]>(this.apiUrl + 'admin/unverified-users', { headers: this.authHeaders() });
  }

  getCommunityStats(): Observable<CommunityStats> {
    return this.http.get<CommunityStats>(this.apiUrl + 'admin/stats', { headers: this.authHeaders() });
  }

  moderatePost(postId: string, action: 'dismiss' | 'remove' | 'restore'): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + 'admin/posts/' + postId + '/moderate', { action }, {
      headers: this.authHeaders()
    });
  }

  moderateUser(userId: string, action: 'suspend' | 'restore'): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + 'admin/users/' + userId + '/moderate', { action }, {
      headers: this.authHeaders()
    });
  }

  verifyUser(userId: string, action: 'approve' | 'revoke'): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.apiUrl + 'admin/users/' + userId + '/verify', { action }, {
      headers: this.authHeaders()
    });
  }
}
