import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export interface ShareTarget {
  key: 'whatsapp' | 'facebook' | 'telegram' | 'x' | 'instagram' | 'copy' | 'native';
  label: string;
  icon: string;
}

@Component({
  selector: 'app-share-menu',
  templateUrl: './share-menu.component.html',
  styleUrls: ['./share-menu.component.css']
})
export class ShareMenuComponent {
  @Input() title: string = '';
  @Input() path: string = '';
  @Input() count?: number;
  @Output() shared = new EventEmitter<void>();

  copied: boolean = false;
  instagramHint: boolean = false;

  constructor(private translate: TranslateService) {}

  get shareUrl(): string {
    const origin = window.location.origin;
    return this.path.startsWith('http') ? this.path : `${origin}${this.path}`;
  }

  get shareText(): string {
    return this.title || this.translate.instant('community.shareTitleDefault');
  }

  get supportsNativeShare(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).share;
  }

  shareTo(target: ShareTarget['key']): void {
    const url = this.shareUrl;
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(this.shareText);

    switch (target) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, '_blank');
        this.shared.emit();
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');
        this.shared.emit();
        break;
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank');
        this.shared.emit();
        break;
      case 'x':
        window.open(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`, '_blank');
        this.shared.emit();
        break;
      case 'instagram':
        // Instagram has no web share-intent URL, so the best available fallback
        // is to copy the link and let the person paste it into a DM, bio, or story.
        this.copyLink();
        this.instagramHint = true;
        setTimeout(() => this.instagramHint = false, 3000);
        this.shared.emit();
        break;
      case 'copy':
        this.copyLink();
        this.shared.emit();
        break;
      case 'native':
        this.nativeShare();
        break;
    }
  }

  private copyLink(): void {
    navigator.clipboard.writeText(this.shareUrl).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2500);
    }).catch(() => {
      // Fallback for browsers without Clipboard API permission
      const tempInput = document.createElement('input');
      tempInput.value = this.shareUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      this.copied = true;
      setTimeout(() => this.copied = false, 2500);
    });
  }

  private nativeShare(): void {
    if (this.supportsNativeShare) {
      (navigator as any).share({
        title: this.shareText,
        text: this.shareText,
        url: this.shareUrl
      }).then(() => this.shared.emit()).catch(() => { /* user cancelled, no-op */ });
    } else {
      // Automatic fallback when the Web Share API isn't supported on this device/browser.
      this.copyLink();
      this.shared.emit();
    }
  }
}
