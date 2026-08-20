import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { CommunityPost, FilterOptions, SearchResults } from '../../models/community.model';
import { CommunityDataService } from '../../services/community-data.service';
import { CityService } from '../../../shared/city.service';

type SortOrder = 'latest' | 'trending' | 'topRated' | 'mostCommented';

@Component({
  selector: 'app-community-home',
  templateUrl: './community-home.component.html',
  styleUrls: ['./community-home.component.css']
})
export class CommunityHomeComponent implements OnInit, OnDestroy {
  posts: CommunityPost[] = [];
  loading: boolean = true;
  loadingMore: boolean = false;
  errorMessage: string = '';
  hasMore: boolean = true;
  private currentPage: number = 1;
  private readonly pageSize: number = 6;

  activeCategory: string = '';
  activeRoute: string = '';
  activeDestination: string = '';
  activeHashtag: string = '';
  searchTerm: string = '';
  activeSort: SortOrder = 'latest';

  filterOptions: FilterOptions = { routes: [], destinations: [] };

  // Search autocomplete
  showSearchResults: boolean = false;
  searching: boolean = false;
  searchResults: SearchResults = { users: [], posts: [], destinations: [], hashtags: [] };
  private searchSubject = new Subject<string>();

  sortOptions: { key: SortOrder; label: string }[] = [
    { key: 'latest', label: 'community.sort.latest' },
    { key: 'trending', label: 'community.sort.popularPosts' },
    { key: 'topRated', label: 'community.sort.topRatedStories' },
    { key: 'mostCommented', label: 'community.sort.mostCommented' }
  ];

  constructor(
    private communityData: CommunityDataService,
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private cityService: CityService
  ) { }

  ngOnInit(): void {
    this.communityData.getFilterOptions().subscribe({
      next: (options) => this.filterOptions = options,
      error: () => this.filterOptions = { routes: [], destinations: [] }
    });

    // Support deep-linking to a hashtag (e.g. from the sidebar or profile).
    this.route.queryParams.subscribe((params) => {
      if (params['hashtag']) {
        this.activeHashtag = params['hashtag'].replace(/^#/, '');
        this.resetAndLoad();
      }
    });

    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe((term) => {
      if (term.trim().length < 2) {
        this.searchResults = { users: [], posts: [], destinations: [], hashtags: [] };
        this.showSearchResults = false;
        return;
      }
      this.searching = true;
      this.communityData.search(term.trim()).subscribe({
        next: (results) => {
          this.searchResults = results;
          this.showSearchResults = true;
          this.searching = false;
        },
        error: () => {
          this.searching = false;
          this.showSearchResults = false;
        }
      });
    });

    this.resetAndLoad();
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  resetAndLoad(): void {
    this.currentPage = 1;
    this.posts = [];
    this.hasMore = true;
    this.loadPage();
  }

  loadPage(): void {
    if (this.currentPage === 1) {
      this.loading = true;
    } else {
      this.loadingMore = true;
    }
    this.errorMessage = '';

    this.communityData.getPosts({
      page: this.currentPage,
      limit: this.pageSize,
      category: this.activeCategory || undefined,
      route: this.activeRoute || undefined,
      destination: this.activeDestination || undefined,
      hashtag: this.activeHashtag || undefined,
      search: this.searchTerm || undefined,
      sort: this.activeSort === 'latest' ? undefined : this.activeSort
    }).subscribe({
      next: (result) => {
        this.posts = [...this.posts, ...result.posts];
        this.hasMore = result.hasMore;
        this.loading = false;
        this.loadingMore = false;
      },
      error: (error) => {
        console.error('Error loading community posts', error);
        this.errorMessage = this.translate.instant('community.loadPostsError');
        this.loading = false;
        this.loadingMore = false;
      }
    });
  }

  loadMore(): void {
    if (this.hasMore && !this.loadingMore && !this.loading) {
      this.currentPage += 1;
      this.loadPage();
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const scrollPosition = window.innerHeight + window.scrollY;
    const nearBottom = document.body.offsetHeight - scrollPosition < 600;
    if (nearBottom) {
      this.loadMore();
    }
  }

  onCategorySelected(category: string): void {
    this.activeCategory = category;
    this.resetAndLoad();
  }

  onRouteFilterChange(route: string): void {
    this.activeRoute = route;
    this.resetAndLoad();
  }

  onDestinationFilterChange(destination: string): void {
    this.activeDestination = destination;
    this.resetAndLoad();
  }

  onSearch(term: string): void {
    this.searchTerm = this.cityService.toCanonical(term);
    this.showSearchResults = false;
    this.resetAndLoad();
  }

  onSearchInput(term: string): void {
    this.searchSubject.next(this.cityService.toCanonical(term));
  }

  selectHashtag(hashtag: string): void {
    this.activeHashtag = hashtag;
    this.searchTerm = '';
    this.showSearchResults = false;
    this.router.navigate(['/community'], { queryParams: { hashtag } });
    this.resetAndLoad();
  }

  selectDestination(destination: string): void {
    this.activeDestination = destination;
    this.searchTerm = '';
    this.showSearchResults = false;
    this.resetAndLoad();
  }

  selectUser(userId: string): void {
    this.showSearchResults = false;
    this.router.navigate(['/community/profile', userId]);
  }

  selectPost(postId: string): void {
    this.showSearchResults = false;
    this.router.navigate(['/community/post', postId]);
  }

  closeSearchResults(): void {
    setTimeout(() => this.showSearchResults = false, 150);
  }

  setSort(sort: SortOrder): void {
    if (this.activeSort === sort) return;
    this.activeSort = sort;
    this.resetAndLoad();
  }

  clearFilters(): void {
    this.activeCategory = '';
    this.activeRoute = '';
    this.activeDestination = '';
    this.activeHashtag = '';
    this.searchTerm = '';
    this.router.navigate(['/community']);
    this.resetAndLoad();
  }

  openPost(id: string): void {
    this.router.navigate(['/community/post', id]);
  }

  onPostDeleted(id: string): void {
    this.posts = this.posts.filter((p) => p.id !== id);
  }

  goToCreatePost(): void {
    this.router.navigate(['/community/create']);
  }
}
