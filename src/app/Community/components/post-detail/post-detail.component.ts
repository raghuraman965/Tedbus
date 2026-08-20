import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityDataService } from '../../services/community-data.service';
import { CommunityPost } from '../../models/community.model';
import { AuthService } from '../../../Premium/services/auth.service';
import { resolveImageUrl, useImageFallback } from '../../../Premium/utils/image-fallback';

@Component({
  selector: 'app-post-detail',
  templateUrl: './post-detail.component.html',
  styleUrls: ['./post-detail.component.css']
})
export class PostDetailComponent implements OnInit {
  post: CommunityPost | undefined;
  relatedPosts: CommunityPost[] = [];
  loading: boolean = true;
  errorMessage: string = '';
  newComment: string = '';
  activeImageIndex = 0;
  postingComment: boolean = false;
  onImageError = useImageFallback;

  reportReasons = [
    'community.reportReason.spam',
    'community.reportReason.abuse',
    'community.reportReason.fakeInfo',
    'community.reportReason.harassment',
    'community.reportReason.other'
  ];
  reportMessage: string = '';
  reportSubmitted: boolean = false;
  followingInFlight: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private communityData: CommunityDataService,
    private authService: AuthService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadPost(id);
      this.loadRelated(id);
    } else {
      this.loading = false;
    }
  }

  loadPost(id: string): void {
    this.loading = true;
    this.errorMessage = '';
    this.communityData.getPostById(id).subscribe({
      next: (post) => {
        this.post = post;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading post', error);
        this.errorMessage = this.translate.instant('community.storyLoadError');
        this.loading = false;
      }
    });
  }

  loadRelated(id: string): void {
    this.communityData.getRelatedPosts(id).subscribe({
      next: (posts) => this.relatedPosts = posts,
      error: () => this.relatedPosts = []
    });
  }

  get isOwner(): boolean {
    const currentUser = this.authService.currentUser;
    return !!currentUser && this.post?.user.id === currentUser._id;
  }

  private requireLogin(): boolean {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }

  toggleLike(): void {
    if (!this.post || !this.requireLogin()) return;

    const wasLiked = this.post.liked;
    this.post.liked = !wasLiked;
    this.post.likes += this.post.liked ? 1 : -1;

    this.communityData.toggleLike(this.post.id).subscribe({
      next: (result) => {
        if (!this.post) return;
        this.post.likes = result.likes;
        this.post.liked = result.liked;
      },
      error: () => {
        if (!this.post) return;
        this.post.liked = wasLiked;
        this.post.likes += wasLiked ? 1 : -1;
      }
    });
  }

  toggleBookmark(): void {
    if (!this.post || !this.requireLogin()) return;

    const wasBookmarked = this.post.bookmarked;
    this.post.bookmarked = !wasBookmarked;

    this.communityData.toggleBookmark(this.post.id).subscribe({
      next: (result) => { if (this.post) this.post.bookmarked = result.bookmarked; },
      error: () => { if (this.post) this.post.bookmarked = wasBookmarked; }
    });
  }

  onShared(): void {
    if (!this.post) return;
    this.post.shares += 1;
    this.communityData.incrementShare(this.post.id).subscribe({
      next: (result) => { if (this.post) this.post.shares = result.shares; },
      error: () => { /* already optimistically updated */ }
    });
  }

  report(reason: string): void {
    if (!this.post || !this.requireLogin()) return;

    this.reportMessage = '';
    this.communityData.reportPost(this.post.id, this.translate.instant(reason)).subscribe({
      next: () => {
        this.reportSubmitted = true;
        this.reportMessage = this.translate.instant('community.reportSuccess');
      },
      error: (error) => {
        this.reportMessage = error?.error?.error || this.translate.instant('community.reportError');
      }
    });
  }

  toggleFollowAuthor(): void {
    if (!this.post || !this.requireLogin() || this.followingInFlight) return;

    this.followingInFlight = true;
    const isFollowing = this.post.user.isFollowing;
    const request = isFollowing
      ? this.communityData.unfollowUser(this.post.user.id)
      : this.communityData.followUser(this.post.user.id);

    request.subscribe({
      next: (result) => {
        if (!this.post) return;
        this.post.user.isFollowing = result.following;
        if (this.post.user.followers !== undefined) {
          this.post.user.followers = result.followerCount;
        }
      },
      error: () => {
        this.reportMessage = this.translate.instant('community.followError');
      },
      complete: () => {
        this.followingInFlight = false;
      }
    });
  }

  deletePost(): void {
    if (!this.post || !this.requireLogin()) return;
    if (confirm(this.translate.instant('community.deleteConfirm'))) {
      this.communityData.deletePost(this.post.id).subscribe({
        next: () => this.router.navigate(['/community']),
        error: (error) => alert(error?.error?.error || this.translate.instant('community.deleteError'))
      });
    }
  }

  postComment(): void {
    if (!this.post || !this.newComment.trim()) return;
    if (!this.requireLogin()) return;

    this.postingComment = true;
    this.communityData.addComment(this.post.id, this.newComment.trim()).subscribe({
      next: (updatedPost) => {
        this.post = updatedPost;
        this.newComment = '';
        this.postingComment = false;
      },
      error: () => {
        this.postingComment = false;
        alert(this.translate.instant('community.commentPostError'));
      }
    });
  }

  setActiveImage(i: number): void {
    this.activeImageIndex = i;
  }

  getImageUrl(src: string): string {
    return resolveImageUrl(src);
  }

  goBack(): void {
    this.router.navigate(['/community']);
  }

  goToProfile(userId: string): void {
    this.router.navigate(['/community/profile', userId]);
  }

  openPost(id: string): void {
    this.router.navigate(['/community/post', id]);
  }
}
