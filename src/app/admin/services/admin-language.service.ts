import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { SUPPORTED_LANGUAGES } from '../../Premium/services/language.service';

const ADMIN_LANG_KEY = 'tedbus_admin_language';

@Injectable({ providedIn: 'root' })
export class AdminLanguageService {
  private languageSubject = new BehaviorSubject<string>(this.readStored());
  language$ = this.languageSubject.asObservable();

  constructor(private translate: TranslateService) {}

  get currentLang(): string {
    return this.languageSubject.value;
  }

  private readStored(): string {
    const stored = localStorage.getItem(ADMIN_LANG_KEY);
    return this.isSupported(stored) ? stored! : 'en';
  }

  private isSupported(code: string | null | undefined): code is string {
    return !!code && SUPPORTED_LANGUAGES.some(l => l.code === code);
  }

  setLanguage(code: string): void {
    const lang = this.isSupported(code) ? code : 'en';
    if (lang === this.currentLang) return;
    this.translate.use(lang).subscribe({
      next: () => {
        this.languageSubject.next(lang);
        localStorage.setItem(ADMIN_LANG_KEY, lang);
      }
    });
  }

  activate(): void {
    const lang = this.readStored();
    this.translate.use(lang).subscribe(() => {
      this.languageSubject.next(lang);
    });
  }

  getLocale(): string {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === this.currentLang);
    return lang ? lang.locale : 'en-IN';
  }

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
