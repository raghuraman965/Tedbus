import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { BusService } from '../../../service/bus.service';
import { TranslateService } from '@ngx-translate/core';
import {
  bookingStatusInfo,
  paymentStatusInfo,
  displayPnr,
  formatBookingDate,
  formatHour,
  money,
  bookingBusImage,
  effectiveTripStatus,
  isBookingExpired,
  canCancel,
  canTrack
} from '../../../utils/booking-display';

export type TripFilter = 'all' | 'upcoming' | 'completed' | 'cancelled' | 'expired';

@Component({
  selector: 'app-my-trip',
  templateUrl: './my-trip.component.html',
  styleUrl: './my-trip.component.css'
})
export class MyTripComponent implements OnChanges {
  @Input() booking: any = [];
  @Output() refresh = new EventEmitter<void>();

  cancellingId: string = '';
  downloadingId: string = '';

  activeFilter: TripFilter = 'all';
  filteredBookings: any[] = [];

  filterCounts: Record<TripFilter, number> = {
    all: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
  };

  constructor(
    private router: Router,
    private busservice: BusService,
    private translate: TranslateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['booking']) {
      this.applyFilter();
    }
  }

  setFilter(f: TripFilter): void {
    this.activeFilter = f;
    this.applyFilter();
  }

  private applyFilter(): void {
    const list = Array.isArray(this.booking) ? this.booking : [];

    // Compute counts
    this.filterCounts = { all: list.length, upcoming: 0, completed: 0, cancelled: 0, expired: 0 };
    for (const b of list) {
      const eff = effectiveTripStatus(b);
      if (eff === 'cancelled') this.filterCounts.cancelled++;
      else if (eff === 'completed') this.filterCounts.completed++;
      else if (eff === 'expired') this.filterCounts.expired++;
      else this.filterCounts.upcoming++;
    }

    // Filter
    if (this.activeFilter === 'all') {
      this.filteredBookings = [...list];
    } else {
      this.filteredBookings = list.filter((b: any) => {
        const eff = effectiveTripStatus(b);
        if (this.activeFilter === 'cancelled') return eff === 'cancelled';
        if (this.activeFilter === 'completed') return eff === 'completed';
        if (this.activeFilter === 'expired') return eff === 'expired';
        // upcoming = anything not cancelled/completed/expired
        return eff !== 'cancelled' && eff !== 'completed' && eff !== 'expired';
      });
    }
  }

  statusBadge(b: any) { return bookingStatusInfo(b); }
  paymentBadge(b: any) { return paymentStatusInfo(b); }
  pnr(b: any) { return displayPnr(b); }
  busImage(b: any) { return bookingBusImage(b); }

  isExpired(b: any): boolean { return isBookingExpired(b); }
  isCancelled(b: any): boolean { return b?.status === 'cancelled'; }
  isCompleted(b: any): boolean { return effectiveTripStatus(b) === 'completed'; }
  showCancel(b: any): boolean { return canCancel(b); }
  showTrack(b: any): boolean { return canTrack(b); }

  formatDate(d?: string): string { return formatBookingDate(d); }
  formatTime(t?: number | string): string { return formatHour(t); }
  formatMoney(n?: number | string): string { return money(n); }

  seatsLabel(b: any): string {
    const seats = b?.seats || [];
    return seats.length ? seats.map((s: any) => `S${s}`).join(', ') : '--';
  }

  pnrOf(b: any): string {
    return b?.pnr || String(b?._id || b?.id || '').slice(-8).toUpperCase();
  }

  viewTicket(b: any): void {
    this.router.navigate(['/ticket', this.pnrOf(b)]);
  }

  downloadTicket(b: any): void {
    this.downloadingId = this.pnrOf(b);
    this.busservice.downloadTicketPdf(this.pnrOf(b), false).subscribe({
      next: (blob) => {
        this.busservice.saveTicketPdfBlob(blob, `TEDBUS_${this.pnrOf(b)}.pdf`);
        this.downloadingId = '';
      },
      error: () => {
        this.downloadingId = '';
        alert(this.translate.instant('booking.errDownload'));
      }
    });
  }

  trackBus(b: any): void {
    const dep = b?.departureDetails?.city || '';
    const arr = b?.arrivalDetails?.city || '';
    if (dep && arr) {
      this.router.navigate(['/classic-select-bus'], {
        queryParams: { from: dep, to: arr }
      });
    }
  }

  cancelBooking(b: any): void {
    const pnr = this.pnrOf(b);
    const id = b?._id || b?.id;
    if (!id) return;
    const ok = confirm(this.translate.instant('trips.confirmCancel', { pnr }));
    if (!ok) return;
    this.cancellingId = pnr;
    this.busservice.cancelBooking(id).subscribe({
      next: () => {
        this.cancellingId = '';
        this.refresh.emit();
      },
      error: (err) => {
        this.cancellingId = '';
        alert(err?.error?.error || this.translate.instant('trips.cancelFailed'));
      }
    });
  }
}
