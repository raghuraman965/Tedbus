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

  /** Cancel = always quote the live cancellation policy first so the user
   *  sees EXACTLY what will be refunded before committing. */
  cancelBooking(b: any): void {
    const pnr = this.pnrOf(b);
    const id = b?._id || b?.id;
    if (!id) return;
    this.cancellingId = pnr;
    this.busservice.refundQuote(id).subscribe({
      next: (quote) => {
        if (quote?.alreadyCancelled) {
          this.cancellingId = '';
          this.refresh.emit();
          return;
        }
        if (quote && quote.allowed === false) {
          this.cancellingId = '';
          alert(quote.reason === 'JOURNEY_ALREADY_STARTED'
            ? this.translate.instant('booking.cancelWindowClosed')
            : this.translate.instant('trips.cancelFailed'));
          return;
        }
        const amount = Number(quote?.refundAmount) || 0;
        const percent = Number(quote?.refundPercent) || 0;
        const detail = percent > 0
          ? this.translate.instant('trips.refundPreview', { amount: this.formatMoney(amount), percent })
          : this.translate.instant('trips.refundNone');
        const ok = confirm(
          `${this.translate.instant('trips.confirmCancel', { pnr })}\n${detail}`
        );
        if (!ok) {
          this.cancellingId = '';
          return;
        }
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
      },
      error: (err) => {
        this.cancellingId = '';
        alert(err?.error?.error || this.translate.instant('trips.cancelFailed'));
      }
    });
  }

  /** Refund line shown on cancelled trip cards — straight off the booking
   *  record the server wrote at cancellation time. */
  refundLabel(b: any): string {
    const status = b?.refundStatus;
    const amount = Number(b?.refundAmount) || 0;
    if (!status || status === 'none') return '';
    const money = this.formatMoney(amount);
    if (status === 'processed') return this.translate.instant('trips.refunded', { amount: money });
    if (status === 'initiated') return this.translate.instant('trips.refundInitiated', { amount: money });
    return this.translate.instant('trips.refundPending', { amount: money });
  }
}
