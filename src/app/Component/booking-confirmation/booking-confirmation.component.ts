import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BusService } from '../../service/bus.service';
import { TranslateService } from '@ngx-translate/core';
import {
  bookingStatusInfo,
  paymentStatusInfo,
  displayPnr,
  formatBookingDate,
  formatHour,
  money,
  bookingBusImage,
  timelineSteps as timelineStepsFor
} from '../../utils/booking-display';

@Component({
  selector: 'app-booking-confirmation',
  templateUrl: './booking-confirmation.component.html',
  styleUrl: './booking-confirmation.component.css'
})
export class BookingConfirmationComponent implements OnInit {
  pnr: string = '';
  booking: any = null;
  loading: boolean = true;
  error: string = '';
  downloading: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private busservice: BusService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.pnr = params['pnr'];
      this.loadBooking();
    });
  }

  private loadBooking(): void {
    this.loading = true;
    this.error = '';
    this.busservice.getBookingByPnr(this.pnr).subscribe({
      next: (booking) => {
        this.booking = booking;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = this.translate.instant('booking.errNotFound');
      }
    });
  }

  get statusBadge() { return bookingStatusInfo(this.booking); }
  get paymentBadge() { return paymentStatusInfo(this.booking); }
  get pnrDisplay() { return displayPnr(this.booking); }
  get busImage() { return bookingBusImage(this.booking); }

  downloadTicket(): void {
    this.downloading = true;
    this.busservice.downloadTicketPdf(this.pnr, false).subscribe({
      next: (blob) => {
        this.busservice.saveTicketPdfBlob(blob, `TEDBUS_${this.pnr}.pdf`);
        this.downloading = false;
      },
      error: () => {
        this.downloading = false;
        alert(this.translate.instant('booking.errDownload'));
      }
    });
  }

  viewTicket(): void {
    this.router.navigate(['/ticket', this.pnr]);
  }

  goToTrips(): void {
    this.router.navigate(['/profile']);
  }

  bookAnother(): void {
    this.router.navigate(['/classic-home']);
  }

  formatDate(d?: string): string { return formatBookingDate(d); }
  formatTime(t?: number | string): string { return formatHour(t); }
  formatMoney(n?: number | string): string { return money(n); }
  timelineSteps(b: any) { return timelineStepsFor(b); }
  seatsLabel(): string {
    const seats = this.booking?.seats || [];
    return seats.length ? seats.map((s: any) => `S${s}`).join(', ') : '--';
  }
}
