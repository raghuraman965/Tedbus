import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { url } from '../../config';

export interface AppLanguage {
  code: 'en' | 'ta' | 'hi' | 'te' | 'kn' | 'ml' | string;
  label: string;
  nativeName: string;
  locale: string;
  flag: string;
}

// Add a new entry here (+ a matching assets/i18n/<code>.json file and a
// SUPPORTED_LANGUAGES entry on the backend) to enable a new language.
export const SUPPORTED_LANGUAGES: AppLanguage[] = [
  { code: 'en', label: 'English', nativeName: 'English', locale: 'en-IN', flag: '🇬🇧' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', locale: 'ta-IN', flag: '🇮🇳' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', locale: 'hi-IN', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', nativeName: 'తెలుగు', locale: 'te-IN', flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada', nativeName: 'ಕನ್ನಡ', locale: 'kn-IN', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', nativeName: 'മലയാളം', locale: 'ml-IN', flag: '🇮🇳' }
];

const LANG_KEY = 'tedbus_customer_language';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private languageSubject = new BehaviorSubject<string>(this.readStored());
  /** Emits whenever the active language changes (including on boot). */
  language$ = this.languageSubject.asObservable();

  private transitionSubject = new BehaviorSubject<'in' | 'out'>('in');
  /** Emits 'out' while the current content is fading out and 'in' once the
   *  new language is rendered. The app root animates the whole page on this. */
  transitionState$ = this.transitionSubject.asObservable();

  /** Duration of the fade-out phase (matches the Angular animation below). */
  private readonly fadeOutMs = 120;

  private ready = false;

  constructor(
    private translate: TranslateService,
    private http: HttpClient,
    private authService: AuthService
  ) {
    // When a user logs in (or a remembered session is restored mid-session),
    // adopt the language saved on their account. Skipped while init() is still
    // resolving to avoid racing the boot-time language load.
    this.authService.currentUser$.subscribe(user => {
      if (user && this.ready && this.isSupported(user.preferredLanguage)) {
        this.restoreFromUser();
      }
    });
  }

  private readStored(): string {
    const stored = localStorage.getItem(LANG_KEY);
    return this.isSupported(stored) ? stored : 'en';
  }

  private isSupported(code: string | null | undefined): code is string {
    return !!code && SUPPORTED_LANGUAGES.some(l => l.code === code);
  }

  /** Called once via APP_INITIALIZER so the saved language is active before the
   *  first render (no untranslated flash). Falls back to English on any error. */
  init(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.translate.setDefaultLang('en');
      const initial = this.readStored();
      this.translate.use(initial).subscribe({
        next: () => {
          this.languageSubject.next(initial);
          this.ready = true;
          this.syncWithServer(initial);
          resolve();
        },
        error: () => {
          this.translate.use('en').subscribe(() => {
            this.ready = true;
            resolve();
          }, () => {
            this.ready = true;
            resolve();
          });
        }
      });
    });
  }

  get currentLang(): string {
    return this.languageSubject.value;
  }

  /** Instantly switches the active language, persists it locally, and (for
   *  logged-in users) syncs it to their MongoDB profile. The whole page plays
   *  a premium fade/blur/scale transition: fade out -> swap strings -> fade in. */
  setLanguage(code: string): void {
    const lang = this.isSupported(code) ? code : 'en';
    if (lang === this.currentLang) return;
    this.transitionSubject.next('out');
    setTimeout(() => {
      this.translate.use(lang).subscribe({
        next: () => {
          this.languageSubject.next(lang);
          localStorage.setItem(LANG_KEY, lang);
          this.syncWithServer(lang);
          setTimeout(() => this.transitionSubject.next('in'), 30);
        },
        error: () => {
          setTimeout(() => this.transitionSubject.next('in'), 30);
        }
      });
    }, this.fadeOutMs);
  }

  /** Re-activate customer language (called when navigating back from admin). */
  activate(): void {
    const lang = this.readStored();
    this.translate.use(lang).subscribe(() => {
      this.languageSubject.next(lang);
    });
  }

  /** Restores the language saved in the logged-in user's MongoDB profile
   *  (called after login so the preference follows the account). */
  restoreFromUser(): void {
    const user = this.authService.currentUser;
    const preferred = user && user.preferredLanguage;
    if (!this.isSupported(preferred)) return;
    if (preferred !== this.readStored()) {
      this.transitionSubject.next('out');
      setTimeout(() => {
        this.translate.use(preferred).subscribe(() => {
          this.languageSubject.next(preferred);
          localStorage.setItem(LANG_KEY, preferred);
          setTimeout(() => this.transitionSubject.next('in'), 30);
        });
      }, this.fadeOutMs);
    }
  }

  private syncWithServer(code: string): void {
    if (!this.authService.isLoggedIn || !this.authService.token) return;
    const user = this.authService.currentUser;
    if (user && user.preferredLanguage === code) return;
    this.http.put<{ preferredLanguage: string }>(
      url + 'user/preference',
      { preferredLanguage: code },
      { headers: { Authorization: `Bearer ${this.authService.token}` } }
    ).subscribe({
      next: () => {
        const current = this.authService.currentUser;
        if (current) {
          this.authService.updateUser({ ...current, preferredLanguage: code });
        }
      },
      error: () => undefined
    });
  }

  /** BCP-47 locale for the current language (used with the Intl API). */
  getLocale(): string {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === this.currentLang);
    return lang ? lang.locale : 'en-IN';
  }

  // ---- Locale-aware date/time/number/currency helpers -------------------

  formatDate(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
    const d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) return String(value ?? '');
    const { weekday, ...rest } = opts;
    const base = { day: 'numeric', month: 'short', year: 'numeric' } as Intl.DateTimeFormatOptions;
    return new Intl.DateTimeFormat(this.getLocale(), weekday ? { ...base, weekday } : base).format(d);
  }

  formatTime(value: string | null | undefined): string {
    if (!value) return '';
    const parts = value.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h)) return value;
    const date = new Date(2020, 0, 1, h, isNaN(m) ? 0 : m);
    return new Intl.DateTimeFormat(this.getLocale(), { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  formatCurrency(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat(this.getLocale(), {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(n);
  }

  formatNumber(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat(this.getLocale()).format(n);
  }

  /** Locale-aware relative time ("5 minutes ago"), for notification timestamps. */
  formatRelative(value: string | number | Date | null | undefined): string {
    const d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return '';
    const diffSeconds = (d.getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(this.getLocale(), { numeric: 'auto' });

    const abs = Math.abs(diffSeconds);
    if (abs < 45) return rtf.format(Math.round(diffSeconds), 'second');
    if (abs < 90) return rtf.format(Math.round(diffSeconds / 60), 'minute');
    const minutes = Math.round(abs / 60);
    if (minutes < 60) return rtf.format(-Math.round(abs / 60), 'minute');
    const hours = Math.round(abs / 3600);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(abs / 86400);
    if (days < 30) return rtf.format(-days, 'day');
    const months = Math.round(abs / 2592000);
    if (months < 12) return rtf.format(-months, 'month');
    return rtf.format(-Math.round(abs / 31536000), 'year');
  }
}
