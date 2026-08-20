import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, filter } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { url } from '../../config';
import { AuthService, AuthUser } from './auth.service';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'tedbus-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
  private themeSubject = new BehaviorSubject<ThemeMode>(this.readInitialTheme());
  theme$ = this.themeSubject.asObservable();

  /** The actual applied theme (light or dark) — never 'system'. */
  private appliedSubject = new BehaviorSubject<'light' | 'dark'>(
    this.resolve(this.readInitialTheme())
  );
  applied$ = this.appliedSubject.asObservable();

  private authSub?: Subscription;
  private mq = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  private mqHandler = () => this.onSystemThemeChange();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.applyThemeToDocument(this.appliedSubject.value);

    if (this.mq) {
      this.mq.addEventListener('change', this.mqHandler);
    }

    this.authSub = this.authService.currentUser$
      .pipe(filter((u): u is AuthUser => !!u))
      .subscribe(user => this.syncFromProfile(user));
  }

  ngOnDestroy(): void {
    this.mq?.removeEventListener('change', this.mqHandler);
    this.authSub?.unsubscribe();
  }

  /** Resolve 'system' to actual light/dark based on OS preference. */
  resolve(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'system') {
      return this.getSystemTheme();
    }
    return mode;
  }

  get current(): ThemeMode {
    return this.themeSubject.value;
  }

  get applied(): 'light' | 'dark' {
    return this.appliedSubject.value;
  }

  setTheme(mode: ThemeMode): void {
    this.themeSubject.next(mode);
    localStorage.setItem(THEME_KEY, mode);
    const resolved = this.resolve(mode);
    this.appliedSubject.next(resolved);
    this.applyThemeToDocument(resolved);
    this.syncToProfile(mode);
  }

  toggleTheme(): void {
    const next = this.applied === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  /** Read theme preference from user profile after login. */
  syncFromProfile(user: AuthUser): void {
    const pref = (user as any).themePreference;
    if (pref === 'light' || pref === 'dark' || pref === 'system') {
      this.setTheme(pref);
    }
  }

  /** Fire-and-forget: persist theme to MongoDB via profile API. */
  private syncToProfile(mode: ThemeMode): void {
    if (!this.authService.isLoggedIn) return;
    this.http.put(`${url}profile`, { themePreference: mode }).subscribe({
      next: () => {},
      error: () => {} // API failure must not break theme switching
    });
  }

  private onSystemThemeChange(): void {
    if (this.themeSubject.value === 'system') {
      const resolved = this.getSystemTheme();
      this.appliedSubject.next(resolved);
      this.applyThemeToDocument(resolved);
    }
  }

  private getSystemTheme(): 'light' | 'dark' {
    return this.mq?.matches ? 'dark' : 'light';
  }

  private readInitialTheme(): ThemeMode {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    return 'light';
  }

  private applyThemeToDocument(mode: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', mode);
  }
}
