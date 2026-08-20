import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';
import { TrendingRoute, PopularDestination, TopContributor, CommunityUser, Hashtag } from '../../models/community.model';
import { IMAGE_FALLBACK_DATA_URI, resolveImageUrl, useImageFallback } from '../../../Premium/utils/image-fallback';

@Component({
  selector: 'app-right-sidebar',
  templateUrl: './right-sidebar.component.html',
  styleUrls: ['./right-sidebar.component.css']
})
export class RightSidebarComponent implements OnInit {
  trendingRoutes: TrendingRoute[] = [];
  popularDestinations: PopularDestination[] = [];
  topContributors: TopContributor[] = [];
  trendingHashtags: Hashtag[] = [];
  suggestedUsers: CommunityUser[] = [];
  fallbackImage = IMAGE_FALLBACK_DATA_URI;
  onImageError = useImageFallback;

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router
  ) { }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  ngOnInit(): void {
    // These all come from real aggregation queries over actual posts, so they
    // naturally read empty until the community has real activity.
    this.communityData.getTrendingRoutes().subscribe({
      next: (routes) => this.trendingRoutes = routes,
      error: () => this.trendingRoutes = []
    });

    this.communityData.getPopularDestinations().subscribe({
      next: (destinations) => this.popularDestinations = destinations,
      error: () => this.popularDestinations = []
    });

    this.communityData.getTopContributors().subscribe({
      next: (contributors) => this.topContributors = contributors,
      error: () => this.topContributors = []
    });

    this.communityData.getTrendingHashtags().subscribe({
      next: (hashtags) => this.trendingHashtags = hashtags,
      error: () => this.trendingHashtags = []
    });

    if (this.authService.isLoggedIn) {
      this.communityData.getSuggestedUsers().subscribe({
        next: (users) => this.suggestedUsers = users,
        error: () => this.suggestedUsers = []
      });
    }
  }

  openProfile(userId: string): void {
    this.router.navigate(['/community/profile', userId]);
  }

  getImageUrl(src: string): string {
    return resolveImageUrl(src);
  }

  openHashtag(hashtag: string): void {
    this.router.navigate(['/community'], { queryParams: { hashtag } });
  }
}
