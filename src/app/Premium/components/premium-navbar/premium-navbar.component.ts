import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
declare var google: any;
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, AuthUser } from '../../services/auth.service';

@Component({
  selector: 'app-premium-navbar',
  templateUrl: './premium-navbar.component.html',
  styleUrls: ['./premium-navbar.component.css']
})
export class PremiumNavbarComponent implements OnInit, OnDestroy {
  currentUser: AuthUser | null = null;
  mobileMenuOpen: boolean = false;
  isScrolled: boolean = false;
  private authSub?: Subscription;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.isScrolled = window.scrollY > 20;
  }

  navLinks: { labelKey: string; icon: string; route: string }[] = [
    { labelKey: 'navbar.busTickets', icon: 'directions_bus', route: '/' },
    { labelKey: 'navbar.cabRental', icon: 'local_taxi', route: '/cab-rental' },
    { labelKey: 'navbar.trainTickets', icon: 'train', route: '/train-tickets' },
    { labelKey: 'navbar.community', icon: 'groups', route: '/community' },
    { labelKey: 'navbar.routePlanner', icon: 'map', route: '/route-planner' },
    { labelKey: 'navbar.driverVerify', icon: 'badge', route: '/driver/verify' }
  ];

  onNavLinkClick(): void {
    this.mobileMenuOpen = false;
  }

  constructor(private router: Router, private authService: AuthService) { }

  get isloggedIn(): boolean {
    return !!this.currentUser;
  }

  ngOnInit(): void {
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  handlelogout(): void {
    // Google Sign-In is only initialized inside the Login modal, but
    // disableAutoSelect is safe to call here too since the GSI script is
    // loaded globally in index.html.
    if (typeof google !== 'undefined') {
      google.accounts.id.disableAutoSelect();
    }
    this.authService.logout();
    window.location.reload();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
    this.mobileMenuOpen = false;
  }

  navigate(route: string): void {
    this.router.navigate([route]);
    this.mobileMenuOpen = false;
  }

  navigateToProfileTab(tab: string): void {
    this.router.navigate(['/profile'], { queryParams: { tab } });
    this.mobileMenuOpen = false;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }
}
