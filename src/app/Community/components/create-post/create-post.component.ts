import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';
import { resolveImageUrl } from '../../../Premium/utils/image-fallback';
import { CityService } from '../../../shared/city.service';

@Component({
  selector: 'app-create-post',
  templateUrl: './create-post.component.html',
  styleUrls: ['./create-post.component.css']
})
export class CreatePostComponent implements OnInit {
  title: string = '';
  story: string = '';
  route: string = '';
  destination: string = '';
  travelDate: Date | null = null;
  tipInput: string = '';
  tips: string[] = [];
  tagInput: string = '';
  tags: string[] = [];
  imagePreviews: string[] = [];
  imageFiles: File[] = [];
  uploadingImage: boolean = false;
  uploadError: string = '';
  categories: { key: string; i18nKey: string }[] = [
    { key: 'bus_reviews', i18nKey: 'community.categoryNames.bus_reviews' },
    { key: 'travel_stories', i18nKey: 'community.categoryNames.travel_stories' },
    { key: 'food_stops', i18nKey: 'community.categoryNames.food_stops' },
    { key: 'hidden_places', i18nKey: 'community.categoryNames.hidden_places' },
    { key: 'night_travel', i18nKey: 'community.categoryNames.night_travel' },
    { key: 'women_safety', i18nKey: 'community.categoryNames.women_safety' },
    { key: 'budget_trips', i18nKey: 'community.categoryNames.budget_trips' },
    { key: 'luxury_trips', i18nKey: 'community.categoryNames.luxury_trips' },
    { key: 'pilgrimage', i18nKey: 'community.categoryNames.pilgrimage' },
    { key: 'hill_stations', i18nKey: 'community.categoryNames.hill_stations' },
    { key: 'beach_destinations', i18nKey: 'community.categoryNames.beach_destinations' }
  ];
  selectedCategory: string = 'travel_stories';

  categoryKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_');
  }
  submitted: boolean = false;
  submitting: boolean = false;
  errorMessage: string = '';
  showEmojiPicker: boolean = false;

  readonly maxImages = 3;
  private readonly maxImageSize = 8 * 1024 * 1024;

  readonly emojis: string[] = [
    '🚌', '🚏', '🏖️', '🏔️', '⛰️', '🌄', '🌅', '🌙', '⭐', '🍽️', '☕', '🍜',
    '😀', '😍', '👋', '🧳', '🎒', '📸', '📍', '❤️', '👍', '💯', '✨', '🤩'
  ];

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router,
    private translate: TranslateService,
    private cityService: CityService
  ) {}

  ngOnInit(): void {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/login']);
    }
  }

  get isVerified(): boolean {
    return this.communityData.isCurrentUserVerified;
  }

  get imageSlotsRemaining(): number {
    return this.maxImages - this.imagePreviews.length;
  }

  addTip(): void {
    const value = this.tipInput.trim();
    if (value) {
      this.tips.push(value);
      this.tipInput = '';
    }
  }

  removeTip(index: number): void {
    this.tips.splice(index, 1);
  }

  addTag(): void {
    const value = this.tagInput.trim().replace(/^#/, '');
    if (value && !this.tags.includes(value)) {
      this.tags.push(value);
      this.tagInput = '';
    }
  }

  removeTag(index: number): void {
    this.tags.splice(index, 1);
  }

  addEmoji(emoji: string): void {
    this.story += emoji;
    this.showEmojiPicker = false;
  }

  /** Uploads each selected file to the real /community/upload endpoint and
   *  shows the returned URL as a preview. Failures surface inline instead of
   *  silently substituting stock images. */
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    this.uploadError = '';

    for (const file of files) {
      if (this.imagePreviews.length >= this.maxImages) {
        this.uploadError = this.translate.instant('community.maxImagesError', { max: this.maxImages });
        break;
      }
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
        this.uploadError = this.translate.instant('community.invalidImageError', { name: file.name });
        continue;
      }
      if (file.size > this.maxImageSize) {
        this.uploadError = this.translate.instant('community.imageTooLargeError', { name: file.name });
        continue;
      }

      this.uploadingImage = true;
      this.communityData.uploadImage(file).subscribe({
        next: (result) => {
          this.imagePreviews.push(result.url);
          this.imageFiles.push(file);
          this.uploadingImage = false;
        },
        error: (error) => {
          this.uploadingImage = false;
          this.uploadError = error?.error?.error || this.translate.instant('community.uploadError');
        }
      });
    }
  }

  removeImage(index: number): void {
    this.imagePreviews.splice(index, 1);
    this.imageFiles.splice(index, 1);
  }

  getImageUrl(src: string): string {
    return resolveImageUrl(src);
  }

  get isFormValid(): boolean {
    return !!(this.title.trim() && this.story.trim() && this.route.trim() && this.destination.trim() && this.travelDate);
  }

  submitPost(): void {
    if (!this.isFormValid || this.submitting || this.uploadingImage) {
      return;
    }
    if (!this.isVerified) {
      this.errorMessage = this.translate.instant('community.verifyToPost');
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.communityData.createPost({
      title: this.title.trim(),
      story: this.story.trim(),
      route: this.cityService.toCanonical(this.route).trim(),
      destination: this.cityService.toCanonical(this.destination).trim(),
      travelDate: this.travelDate ? this.travelDate.toISOString() : '',
      images: this.imagePreviews,
      tips: this.tips,
      tags: this.tags,
      category: this.selectedCategory
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.submitted = true;
        setTimeout(() => {
          this.router.navigate(['/community']);
        }, 1200);
      },
      error: (error) => {
        this.submitting = false;
        this.errorMessage = error?.error?.error || this.translate.instant('community.publishError');
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/community']);
  }
}
