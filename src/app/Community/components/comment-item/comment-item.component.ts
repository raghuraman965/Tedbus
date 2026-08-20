import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityComment } from '../../models/community.model';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';

@Component({
  selector: 'app-comment-item',
  templateUrl: './comment-item.component.html',
  styleUrls: ['./comment-item.component.css']
})
export class CommentItemComponent {
  @Input() comment!: CommunityComment;
  @Input() postId!: string;
  // Bubbles up so the top-level post-detail page can reload the post with a
  // fresh comment tree after any nested add/edit/delete/like action.
  @Output() refresh = new EventEmitter<void>();

  showReplyBox: boolean = false;
  replyText: string = '';
  editText: string = '';
  submitting: boolean = false;

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService
  ) {}

  get isOwner(): boolean {
    const currentUser = this.authService.currentUser;
    return !!currentUser && this.comment.user.id === currentUser._id;
  }

  private requireLogin(): boolean {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }

  toggleLike(): void {
    if (!this.requireLogin()) return;
    const wasLiked = this.comment.liked;
    this.comment.liked = !wasLiked;
    this.comment.likes += this.comment.liked ? 1 : -1;

    this.communityData.toggleLikeComment(this.comment.id).subscribe({
      next: (result) => {
        this.comment.likes = result.likes;
        this.comment.liked = result.liked;
      },
      error: () => {
        this.comment.liked = wasLiked;
        this.comment.likes += wasLiked ? 1 : -1;
      }
    });
  }

  toggleReplyBox(): void {
    if (!this.requireLogin()) return;
    this.showReplyBox = !this.showReplyBox;
  }

  submitReply(): void {
    const text = this.replyText.trim();
    if (!text || !this.requireLogin()) return;

    this.submitting = true;
    this.communityData.addComment(this.postId, text, this.comment.id).subscribe({
      next: () => {
        this.submitting = false;
        this.replyText = '';
        this.showReplyBox = false;
        this.refresh.emit();
      },
      error: () => {
        this.submitting = false;
        alert(this.translate.instant('community.replyError'));
      }
    });
  }

  startEdit(): void {
    this.editText = this.comment.content;
    this.comment.editing = true;
  }

  saveEdit(): void {
    const text = this.editText.trim();
    if (!text) {
      this.comment.editing = false;
      return;
    }
    this.communityData.editComment(this.comment.id, text).subscribe({
      next: () => {
        this.comment.content = text;
        this.comment.editing = false;
      },
      error: () => alert(this.translate.instant('community.commentEditError'))
    });
  }

  cancelEdit(): void {
    this.comment.editing = false;
  }

  deleteComment(): void {
    this.communityData.deleteComment(this.comment.id).subscribe({
      next: () => { this.comment.content = this.translate.instant('community.commentDeleted'); },
      error: () => alert(this.translate.instant('community.commentDeleteError'))
    });
  }

  goToProfile(userId: string): void {
    this.router.navigate(['/community/profile', userId]);
  }
}
