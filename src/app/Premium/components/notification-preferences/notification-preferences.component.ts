import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../service/notification.service';
import { PushNotificationService, PushState, PushStateInfo } from '../../../service/push-notification.service';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CATEGORY_ICON,
  NOTIFICATION_CATEGORY_LABEL,
  NotificationCategory,
  NotificationChannelName,
  NotificationPreferences,
  CategoryPreference
} from '../../../model/notification.model';
import { SUPPORTED_LANGUAGES } from '../../services/language.service';

@Component({
  selector: 'app-notification-preferences',
  templateUrl: './notification-preferences.component.html',
  styleUrls: ['./notification-preferences.component.css']
})
export class NotificationPreferencesComponent implements OnInit, OnDestroy {
  preferences: NotificationPreferences | null = null;
  loading = true;
  saving = false;
  testBusy = false;
  pushBusy = false;
  categories = NOTIFICATION_CATEGORIES;
  channels = NOTIFICATION_CHANNELS;
  categoryIcon = NOTIFICATION_CATEGORY_ICON;
  categoryLabel = NOTIFICATION_CATEGORY_LABEL;
  languages = SUPPORTED_LANGUAGES;

  /** Expanded category sub-panel. */
  expandedCategory: NotificationCategory | null = null;

  private pushInfo: PushStateInfo = { state: 'idle', detail: '' };
  private pushSub?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private pushService: PushNotificationService,
    private snackBar: MatSnackBar,
    private translate: TranslateService
  ) {}

  get pushSupported(): boolean {
    return this.pushService.isSupported;
  }

  get pushState(): PushState {
    return this.pushInfo.state;
  }

  get pushDetail(): string {
    return this.pushInfo.detail;
  }

  get pushStateLabel(): string {
    const key = this.pushState.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
    return this.translate.instant('notification.pushState.' + key);
  }

  ngOnInit(): void {
    this.loadPreferences();
    this.pushSub = this.pushService.state$.subscribe((info) => {
      this.pushInfo = info;
      this.testBusy = false;
    });
  }

  ngOnDestroy(): void {
    this.pushSub?.unsubscribe();
  }

  loadPreferences(): void {
    this.loading = true;
    this.notificationService.getPreferences().subscribe({
      next: (prefs) => {
        this.preferences = prefs;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snack(this.translate.instant('notification.loadError'));
      }
    });
  }

  /** Check if a category is enabled. */
  isCategoryEnabled(cat: NotificationCategory): boolean {
    if (!this.preferences) return true;
    const val = this.preferences.categories[cat];
    if (typeof val === 'boolean') return val;
    if (val && typeof val === 'object') return val.enabled !== false;
    return true;
  }

  /** Check if a specific channel is enabled for a category. */
  isChannelEnabled(cat: NotificationCategory, ch: NotificationChannelName): boolean {
    if (!this.preferences) return true;
    if (this.preferences.channels[ch] === false) return false;
    const val = this.preferences.categories[cat];
    if (typeof val === 'boolean') return val;
    if (val && typeof val === 'object') {
      if (val.enabled === false) return false;
      return (val as any)[ch] !== false;
    }
    return true;
  }

  toggleChannel(channel: NotificationChannelName): void {
    if (!this.preferences) return;
    if (channel === 'push' && !this.pushSupported) {
      this.snack(this.translate.instant('notification.pushUnsupported'));
      return;
    }
    this.preferences.channels[channel] = !this.preferences.channels[channel];
  }

  toggleCategory(category: NotificationCategory): void {
    if (!this.preferences) return;
    const current = this.preferences.categories[category];
    if (typeof current === 'boolean') {
      this.preferences.categories[category] = !current;
    } else if (current && typeof current === 'object') {
      this.preferences.categories[category] = { ...current, enabled: !current.enabled };
    } else {
      this.preferences.categories[category] = { enabled: false, inapp: true, email: true, push: true };
    }
  }

  toggleCategoryChannel(cat: NotificationCategory, ch: NotificationChannelName): void {
    if (!this.preferences) return;
    const current = this.preferences.categories[cat];
    let obj: any;
    if (typeof current === 'boolean') {
      obj = { enabled: current, inapp: true, email: true, push: true };
    } else if (current && typeof current === 'object') {
      obj = { ...current };
    } else {
      obj = { enabled: true, inapp: true, email: true, push: true };
    }
    obj[ch] = !obj[ch];
    this.preferences.categories[cat] = obj;
  }

  toggleExpandCategory(cat: NotificationCategory): void {
    this.expandedCategory = this.expandedCategory === cat ? null : cat;
  }

  setLocale(code: string): void {
    if (this.preferences) {
      this.preferences.locale = code;
    }
  }

  save(): void {
    if (!this.preferences || this.saving) return;
    this.saving = true;
    this.notificationService
      .updatePreferences({
        locale: this.preferences.locale,
        channels: this.preferences.channels,
        categories: this.preferences.categories
      })
      .subscribe({
        next: (saved) => {
          this.preferences = saved;
          this.saving = false;
          this.snack(this.translate.instant('notification.saved'));
        },
        error: () => {
          this.saving = false;
          this.snack(this.translate.instant('notification.saveError'));
        }
      });
  }

  async enablePush(): Promise<void> {
    if (this.pushBusy) return;
    this.pushBusy = true;
    await this.pushService.enable();
    if (this.pushState === 'enabled') {
      this.snack(this.translate.instant('notification.pushEnabled'));
    } else {
      const label = this.pushStateLabel;
      const message = this.pushDetail ? `${label}: ${this.pushDetail}` : label;
      this.snack(message, 5000);
    }
  }

  async disablePush(): Promise<void> {
    if (this.pushBusy) return;
    this.pushBusy = true;
    await this.pushService.disable();
    this.snack(this.translate.instant('notification.pushDisabled'));
  }

  async sendTest(): Promise<void> {
    if (this.testBusy) return;
    this.testBusy = true;
    const res = await this.pushService.sendTestNotification();
    if (res.ok) {
      this.snack(this.translate.instant('notification.pushTestSent'));
    } else {
      this.snack(this.translate.instant('notification.pushTestFailed', { detail: res.detail }), 5000);
    }
  }

  private snack(message: string, duration = 3000): void {
    this.snackBar.open(message, this.translate.instant('common.close'), { duration });
  }
}
