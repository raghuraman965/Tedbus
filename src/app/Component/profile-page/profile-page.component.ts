import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BusService } from '../../service/bus.service';
import { AuthService, AuthUser } from '../../Premium/services/auth.service';
import { Booking } from '../../model/booking.model';
import { formatClockTime } from '../../utils/time-utils';
import {
  effectiveTripStatus,
  isBookingExpired,
  displayPnr,
  money
} from '../../utils/booking-display';
import { resolveImageUrl } from '../../Premium/utils/image-fallback';

@Component({
  selector: 'app-profile-page',
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css'
})
export class ProfilePageComponent implements OnInit {
  selecteditem: string = 'dashboard';
  mobileMenuOpen = false;
  editMode = false;

  currentcustomer: any = null;
  currentname: string = '';
  currentemail: string = '';
  currentphone: string = '';
  currentgender: string = '';
  currentdob: string = '';
  userAvatar: string = '';
  avatarError = false;

  mytrip: Booking[] = [];

  totalTrips = 0;
  upcomingTrips = 0;
  completedTrips = 0;
  cancelledTrips = 0;
  expiredTrips = 0;

  upcomingBooking: Booking | null = null;

  private validTabs = ['dashboard', 'trips', 'profile', 'wallet', 'routes'];

  constructor(
    private busbooking: BusService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Read tab query param for deep-linking from navbar account dropdown
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (tab && this.validTabs.includes(tab)) {
        this.selecteditem = tab;
      }
    });
    const raw = sessionStorage.getItem('Loggedinuser');
    if (raw) {
      try {
        this.currentcustomer = JSON.parse(raw);
        this.currentname = this.currentcustomer?.name || '';
        this.currentemail = this.currentcustomer?.email || '';
        this.currentphone = this.currentcustomer?.phone || '';
        this.currentgender = this.currentcustomer?.gender || '';
        this.currentdob = this.currentcustomer?.dateOfBirth || '';
        this.userAvatar = resolveImageUrl(this.currentcustomer?.profilePicture) || '';
        this.avatarError = false;
      } catch {
        this.currentcustomer = null;
      }
    }

    // Also subscribe to AuthService for live updates
    this.authService.currentUser$.subscribe((u: AuthUser | null) => {
      if (u) {
        this.currentname = u.name || this.currentname;
        this.currentemail = u.email || this.currentemail;
        this.currentphone = u.phone || this.currentphone;
        this.currentdob = u.dateOfBirth || this.currentdob;
        this.currentgender = u.gender || this.currentgender;
        this.userAvatar = resolveImageUrl(u.profilePicture) || this.userAvatar;
      }
    });

    this.loadBookings();
  }

  loadBookings(): void {
    const user = this.currentcustomer;
    if (!user?._id) return;
    this.busbooking.getbusmongo(user._id).subscribe({
      next: (response: any) => {
        this.mytrip = Array.isArray(response) ? response : [];
        this.computeStats();
      },
      error: () => {
        this.mytrip = [];
        this.computeStats();
      }
    });
  }

  computeStats(): void {
    this.totalTrips = this.mytrip.length;
    this.upcomingTrips = 0;
    this.completedTrips = 0;
    this.cancelledTrips = 0;
    this.expiredTrips = 0;
    this.upcomingBooking = null;

    for (const b of this.mytrip) {
      const effective = effectiveTripStatus(b);
      if (effective === 'cancelled') {
        this.cancelledTrips++;
      } else if (effective === 'completed') {
        this.completedTrips++;
      } else if (effective === 'expired') {
        this.expiredTrips++;
      } else {
        // Active: upcoming, ticket_confirmed, payment_verified, pending_payment
        this.upcomingTrips++;
      }
    }

    // Find the nearest upcoming booking (by departure date)
    const active = this.mytrip.filter(b => {
      const s = effectiveTripStatus(b);
      return s !== 'cancelled' && s !== 'completed' && s !== 'expired';
    });
    if (active.length > 0) {
      active.sort((a, b) => {
        const da = a.departureDetails?.date || a.bookingDate || '';
        const db = b.departureDetails?.date || b.bookingDate || '';
        return String(da).localeCompare(String(db));
      });
      this.upcomingBooking = active[0];
    } else {
      this.upcomingBooking = null;
    }
  }

  handlelistitemclick(selected: string): void {
    this.selecteditem = selected;
    this.mobileMenuOpen = false;
    this.editMode = false;
  }

  enterEditMode(): void {
    this.editMode = true;
  }

  exitEditMode(): void {
    this.editMode = false;
    this.refreshProfile();
  }

  refreshProfile(): void {
    const raw = sessionStorage.getItem('Loggedinuser');
    if (raw) {
      try {
        this.currentcustomer = JSON.parse(raw);
        this.currentname = this.currentcustomer?.name || '';
        this.currentemail = this.currentcustomer?.email || '';
        this.currentphone = this.currentcustomer?.phone || '';
        this.currentgender = this.currentcustomer?.gender || '';
        this.currentdob = this.currentcustomer?.dateOfBirth || '';
        this.userAvatar = resolveImageUrl(this.currentcustomer?.profilePicture) || '';
        this.avatarError = false;
      } catch {
        this.currentcustomer = null;
      }
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  pnr(b: any): string {
    return displayPnr(b);
  }

  formatMoney(n?: number | string): string {
    return money(n);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  viewTicket(b: any): void {
    this.router.navigate(['/ticket', this.pnr(b)]);
  }

  goToTrips(): void {
    this.selecteditem = 'trips';
  }

  searchBuses(): void {
    this.router.navigate(['/']);
  }

  onAvatarError(): void {
    this.avatarError = true;
  }

  get showAvatar(): boolean {
    return !!this.userAvatar && !this.avatarError;
  }

  planRoute(): void {
    this.router.navigate(['/route-planner']);
  }

  getDepartureCity(b: Booking): string {
    return b?.departureDetails?.city || '--';
  }

  getArrivalCity(b: Booking): string {
    return b?.arrivalDetails?.city || '--';
  }

  getDepartureTime(b: Booking): string {
    const t = b?.departureDetails?.time;
    if (t === undefined || t === null) return '--';
    return formatClockTime(t);
  }

  getArrivalTime(b: Booking): string {
    const t = b?.arrivalDetails?.time;
    if (t === undefined || t === null) return '--';
    return formatClockTime(t);
  }
}
