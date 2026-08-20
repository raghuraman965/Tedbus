import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityPost } from '../../models/community.model';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';
import { resolveImageUrl, useImageFallback } from '../../../Premium/utils/image-fallback';
import { cardEntrance } from '../../../Premium/animations/card-entrance';

@Component({
  selector: 'app-post-card',
  templateUrl: './post-card.component.html',
  styleUrls: ['./post-card.component.css'],
  animations: [cardEntrance]
})
export class PostCardComponent {
  @Input() post!: CommunityPost;
  @Input() compact: boolean = false;
  @Output() openPost = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();

  activeImageIndex = 0;
  imageLoaded: boolean = false;
  onImageError = useImageFallback;

  reportReasons = [
    'community.reportReason.spam',
    'community.reportReason.abuse',
    'community.reportReason.fakeInfo',
    'community.reportReason.harassment',
    'community.reportReason.other'
  ];
  actionMessage: string = '';
  reportSubmitted: boolean = false;
  followingInFlight: boolean = false;

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService
  ) { }

  /** Active language — drives the card entrance replay when language changes. */
  get lang(): string {
    return this.translate.currentLang;
  }

  get isOwner(): boolean {
    const currentUser = this.authService.currentUser;
    return !!currentUser && this.post.user.id === currentUser._id;
  }

  get activeImage(): string {
    const src = this.post.images?.[this.activeImageIndex] || '';
    return resolveImageUrl(src);
  }

  onPhotoError(event: Event): void {
    this.imageLoaded = true; // clear the skeleton
    useImageFallback(event);
  }

  private requireLogin(): boolean {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }

  toggleLike(event: Event): void {
    event.stopPropagation();
    if (!this.requireLogin()) return;

    const wasLiked = this.post.liked;
    this.post.liked = !wasLiked;
    this.post.likes += this.post.liked ? 1 : -1;

    this.communityData.toggleLike(this.post.id).subscribe({
      next: (result) => {
        this.post.likes = result.likes;
        this.post.liked = result.liked;
      },
      error: () => {
        this.post.liked = wasLiked;
        this.post.likes += wasLiked ? 1 : -1;
      }
    });
  }

  toggleBookmark(event: Event): void {
    event.stopPropagation();
    if (!this.requireLogin()) return;

    const wasBookmarked = this.post.bookmarked;
    this.post.bookmarked = !wasBookmarked;

    this.communityData.toggleBookmark(this.post.id).subscribe({
      next: (result) => {
        this.post.bookmarked = result.bookmarked;
      },
      error: () => {
        this.post.bookmarked = wasBookmarked;
      }
    });
  }

  onShared(): void {
    this.post.shares += 1;
    this.communityData.incrementShare(this.post.id).subscribe({
      next: (result) => { this.post.shares = result.shares; },
      error: () => { /* count already optimistically updated, safe to ignore */ }
    });
  }

  report(reason: string): void {
    if (!this.requireLogin()) return;

    this.actionMessage = '';
    this.communityData.reportPost(this.post.id, reason).subscribe({
      next: () => {
        this.reportSubmitted = true;
        this.actionMessage = this.translate.instant('community.reportSuccess');
      },
      error: (error) => {
        this.actionMessage = error?.error?.error || this.translate.instant('community.reportError');
      }
    });
  }

  toggleFollowAuthor(event: Event): void {
    event.stopPropagation();
    if (!this.requireLogin() || this.followingInFlight) return;

    this.followingInFlight = true;
    const isFollowing = this.post.user.isFollowing;
    const request = isFollowing
      ? this.communityData.unfollowUser(this.post.user.id)
      : this.communityData.followUser(this.post.user.id);

    request.subscribe({
      next: (result) => {
        this.post.user.isFollowing = result.following;
        if (this.post.user.followers !== undefined) {
          this.post.user.followers = result.followerCount;
        }
      },
      error: () => {
        this.actionMessage = this.translate.instant('community.followError');
      },
      complete: () => {
        this.followingInFlight = false;
      }
    });
  }

  deletePost(event: Event): void {
    event.stopPropagation();
    if (!this.requireLogin()) return;

    if (confirm(this.translate.instant('community.deleteConfirm'))) {
      this.communityData.deletePost(this.post.id).subscribe({
        next: () => this.deleted.emit(this.post.id),
        error: (error) => alert(error?.error?.error || this.translate.instant('community.deleteError'))
      });
    }
  }

  onAuthorClick(event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/community/profile', this.post.user.id]);
  }

  onHashtagClick(event: Event, tag: string): void {
    event.stopPropagation();
    this.router.navigate(['/community'], { queryParams: { hashtag: tag } });
  }

  onOpenPost(): void {
    this.openPost.emit(this.post.id);
  }

  nextImage(event: Event): void {
    event.stopPropagation();
    if (this.activeImageIndex < this.post.images.length - 1) {
      this.activeImageIndex++;
    } else {
      this.activeImageIndex = 0;
    }
    this.imageLoaded = false;
  }
}
