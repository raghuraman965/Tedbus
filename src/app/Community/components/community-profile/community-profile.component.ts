import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService, AuthUser } from '../../../Premium/services/auth.service';
import { LanguageService } from '../../../Premium/services/language.service';
import { CommunityPost, CommunityUser } from '../../models/community.model';
import { resolveImageUrl, useImageFallback } from '../../../Premium/utils/image-fallback';
import { CityService } from '../../../shared/city.service';

type ProfileTab = 'posts' | 'liked' | 'saved';
type FollowListMode = 'followers' | 'following' | null;

@Component({
  selector: 'app-community-profile',
  templateUrl: './community-profile.component.html',
  styleUrls: ['./community-profile.component.css']
})
export class CommunityProfileComponent implements OnInit {
  authUser: AuthUser | null = null;
  profile: CommunityUser & { email?: string } | null = null;
  isOwnProfile: boolean = false;
  recentPosts: CommunityPost[] = [];
  loading: boolean = true;
  loadingMore: boolean = false;
  errorMessage: string = '';
  onImageError = useImageFallback;

  activeTab: ProfileTab = 'posts';
  private currentPage = 1;
  private readonly pageSize = 10;
  hasMore: boolean = true;

  // Follow lists
  followListMode: FollowListMode = null;
  followListUsers: CommunityUser[] = [];
  loadingFollowList: boolean = false;

  // Editing
  editing: boolean = false;
  editName: string = '';
  editBio: string = '';
  editLocation: string = '';
  uploadingPhoto: boolean = false;
  editError: string = '';
  editMessage: string = '';
  followingInFlight: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService,
    private language: LanguageService,
    private cityService: CityService
    ) {}

  ngOnInit(): void {
    this.authUser = this.authService.currentUser;
    if (!this.authUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.route.paramMap.subscribe((params) => {
      const profileId = params.get('id');
      this.isOwnProfile = !profileId || profileId === this.authUser?._id;
      this.loadProfile(profileId || undefined);
    });
  }

  loadProfile(profileId?: string): void {
    this.loading = true;
    this.errorMessage = '';
    this.activeTab = 'posts';

    const request = profileId
      ? this.communityData.getUserProfile(profileId)
      : this.communityData.getMyProfile();

    request.subscribe({
      next: (profile) => {
        this.profile = profile as CommunityUser & { email?: string };
        this.editName = profile.name;
        this.editBio = profile.bio || '';
        this.editLocation = profile.location || '';
        this.loadPosts(true);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading profile', error);
        this.errorMessage = this.translate.instant('community.profileLoadError');
        this.loading = false;
      }
    });
  }

  loadPosts(reset: boolean = false): void {
    if (!this.profile) return;
    if (reset) {
      this.currentPage = 1;
      this.recentPosts = [];
      this.hasMore = true;
    }

    const options: any = { page: this.currentPage, limit: this.pageSize };
    if (this.activeTab === 'posts') {
      options.authorId = this.profile.id;
    } else if (this.activeTab === 'liked') {
      options.likedByMe = true;
    } else if (this.activeTab === 'saved') {
      options.bookmarkedByMe = true;
    }

    this.loadingMore = this.currentPage > 1;
    this.communityData.getPosts(options).subscribe({
      next: (result) => {
        this.recentPosts = reset ? result.posts : [...this.recentPosts, ...result.posts];
        this.hasMore = result.hasMore;
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
        this.errorMessage = this.errorMessage || this.translate.instant('community.postsLoadError');
      }
    });
  }

  switchTab(tab: ProfileTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.loadPosts(true);
  }

  loadMore(): void {
    if (this.hasMore && !this.loadingMore) {
      this.currentPage += 1;
      this.loadPosts();
    }
  }

  get displayName(): string {
    return this.profile?.name || this.authUser?.name || '';
  }

  get isVerified(): boolean {
    return !!this.profile?.verified || this.authUser?.authProvider === 'google';
  }

  get avatar(): string {
    if (this.profile?.avatar) return resolveImageUrl(this.profile.avatar);
    if (this.authUser?.profilePicture) return resolveImageUrl(this.authUser.profilePicture);
    const initials = (this.displayName || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=D84E55`;
  }

  getImageUrl(src: string): string {
    return resolveImageUrl(src);
  }

  get totalLikes(): number {
    return this.recentPosts.reduce((sum, p) => sum + p.likes, 0);
  }

  get rank(): string {
    const count = this.profile?.postsCount ?? this.recentPosts.length;
    if (count >= 15) return this.translate.instant('community.rank.veteran');
    if (count >= 5) return this.translate.instant('community.rank.explorer');
    if (count >= 1) return this.translate.instant('community.rank.storyteller');
    return this.translate.instant('community.rank.newcomer');
  }

  get joinedDate(): string | null {
    if (!this.profile?.joinedAt) return null;
    const d = new Date(this.profile.joinedAt);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(this.language.getLocale(), { month: 'long', year: 'numeric' });
  }

  openPost(id: string): void {
    this.router.navigate(['/community/post', id]);
  }

  onPostDeleted(id: string): void {
    this.recentPosts = this.recentPosts.filter((p) => p.id !== id);
    if (this.profile?.postsCount !== undefined) {
      this.profile.postsCount = Math.max(0, this.profile.postsCount - 1);
    }
  }

  // ===================== FOLLOW =====================

  toggleFollow(): void {
    if (!this.profile || this.isOwnProfile || this.followingInFlight) return;

    this.followingInFlight = true;
    const isFollowing = this.profile.isFollowing;
    const request = isFollowing
      ? this.communityData.unfollowUser(this.profile.id)
      : this.communityData.followUser(this.profile.id);

    request.subscribe({
      next: (result) => {
        if (!this.profile) return;
        this.profile.isFollowing = result.following;
        this.profile.followers = result.followerCount;
      },
      error: () => alert(this.translate.instant('community.followError')),
      complete: () => this.followingInFlight = false
    });
  }

  // ===================== FOLLOW LISTS =====================

  openFollowList(mode: 'followers' | 'following'): void {
    if (!this.profile) return;
    this.followListMode = mode;
    this.followListUsers = [];
    this.loadingFollowList = true;

    const request = mode === 'followers'
      ? this.communityData.getFollowers(this.profile.id)
      : this.communityData.getFollowing(this.profile.id);

    request.subscribe({
      next: (users) => {
        this.followListUsers = users;
        this.loadingFollowList = false;
      },
      error: () => {
        this.loadingFollowList = false;
        this.followListMode = null;
        alert(this.translate.instant('community.listLoadError'));
      }
    });
  }

  closeFollowList(): void {
    this.followListMode = null;
  }

  viewFollowUser(userId: string): void {
    this.closeFollowList();
    this.router.navigate(['/community/profile', userId]);
  }

  // ===================== EDIT PROFILE =====================

  startEdit(): void {
    this.editing = true;
    this.editError = '';
    this.editMessage = '';
  }

  cancelEdit(): void {
    this.editing = false;
  }

  onAvatarSelected(event: Event): void {
    this.onPhotoSelected(event, 'profilePicture');
  }

  onCoverSelected(event: Event): void {
    this.onPhotoSelected(event, 'coverImage');
  }

  private onPhotoSelected(event: Event, target: 'profilePicture' | 'coverImage'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      this.editError = this.translate.instant('community.chooseImageFile');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      this.editError = this.translate.instant('community.imageUnder8MB');
      return;
    }

    this.uploadingPhoto = true;
    this.communityData.uploadImage(file).subscribe({
      next: (result) => {
        if (target === 'profilePicture') {
          this.profile!.avatar = result.url;
        } else {
          this.profile!.coverImage = result.url;
        }
        this.uploadingPhoto = false;
      },
      error: (error) => {
        this.uploadingPhoto = false;
        this.editError = error?.error?.error || this.translate.instant('community.imageUploadError');
      }
    });
  }

  saveProfile(): void {
    if (!this.profile) return;
    this.editError = '';
    this.editMessage = '';

    this.communityData.updateMyProfile({
      name: this.editName.trim() || this.profile.name,
      bio: this.editBio,
      location: this.cityService.toCanonical(this.editLocation),
      profilePicture: this.profile.avatar.startsWith('/uploads/') ? this.profile.avatar : undefined,
      coverImage: this.profile.coverImage?.startsWith('/uploads/') ? this.profile.coverImage : undefined
    }).subscribe({
      next: (updated) => {
        this.profile = updated as CommunityUser & { email: string };
        this.editName = updated.name;
        this.editBio = updated.bio || '';
        this.editLocation = updated.location || '';
        this.editing = false;
        this.editMessage = this.translate.instant('community.profileUpdated');
        setTimeout(() => this.editMessage = '', 3000);
      },
      error: (error) => {
        this.editError = error?.error?.error || this.translate.instant('community.profileSaveError');
      }
    });
  }
}
