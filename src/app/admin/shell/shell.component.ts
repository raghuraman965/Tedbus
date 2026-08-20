import { Component, OnInit, OnDestroy, HostBinding } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil, map } from 'rxjs/operators';
import { ThemeService } from '../../Premium/services/theme.service';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLanguageService } from '../services/admin-language.service';
import { TranslateService } from '@ngx-translate/core';

interface NavItem {
  route: string;
  icon: string;
  labelKey: string;
}

@Component({
  selector: 'app-admin-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css'],
})
export class ShellComponent implements OnInit, OnDestroy {
  @HostBinding('class.dark') isDark = false;

  sidebarCollapsed = false;
  sidebarOpen = false;
  currentUrl = '';
  currentLang = 'en';
  profileName = 'Admin';

  navItems: NavItem[] = [
    { route: '/admin/dashboard', icon: 'dashboard', labelKey: 'admin.nav.dashboard' },
    { route: '/admin/bookings', icon: 'confirmation_number', labelKey: 'admin.nav.bookings' },
    { route: '/admin/buses', icon: 'directions_bus', labelKey: 'admin.nav.buses' },
    { route: '/admin/routes', icon: 'alt_route', labelKey: 'admin.nav.routes' },
    { route: '/admin/customers', icon: 'group', labelKey: 'admin.nav.customers' },
    { route: '/admin/payments', icon: 'payments', labelKey: 'admin.nav.payments' },
    { route: '/admin/notifications', icon: 'notifications', labelKey: 'admin.nav.notifications' },
    { route: '/admin/offers', icon: 'local_offer', labelKey: 'admin.nav.offers' },
    { route: '/admin/reports', icon: 'analytics', labelKey: 'admin.nav.reports' },
    { route: '/admin/reviews', icon: 'rate_review', labelKey: 'admin.nav.reviews' },
    { route: '/admin/verification', icon: 'verified_user', labelKey: 'admin.nav.verification' },
    { route: '/admin/moderation', icon: 'shield', labelKey: 'admin.nav.moderation' },
    { route: '/admin/settings', icon: 'settings', labelKey: 'admin.nav.settings' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private themeService: ThemeService,
    private authService: AdminAuthService,
    private router: Router,
    private translate: TranslateService,
    private adminLanguageService: AdminLanguageService
  ) {}

  ngOnInit(): void {
    this.themeService.applied$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.isDark = mode === 'dark';
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        this.currentUrl = event.urlAfterRedirects || event.url;
        this.closeMobile();
      });

    this.currentUrl = this.router.url;

    this.adminLanguageService.language$
      .pipe(takeUntil(this.destroy$))
      .subscribe(lang => {
        this.currentLang = lang;
      });

    if (this.authService.profile) {
      const p = this.authService.profile as any;
      this.profileName = p.name || p.username || 'Admin';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get pageTitle(): string {
    const segments = this.currentUrl.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || 'dashboard';
    const key = `admin.nav.${last}`;
    return this.translate.instant(key);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleSidebar(): void {
    if (window.innerWidth <= 1024) {
      this.sidebarOpen = !this.sidebarOpen;
    } else {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    }
  }

  toggleMobile(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeMobile(): void {
    if (window.innerWidth <= 1024) {
      this.sidebarOpen = false;
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/admin/login']);
  }

  isActive(route: string): boolean {
    return this.currentUrl.startsWith(route);
  }
}
