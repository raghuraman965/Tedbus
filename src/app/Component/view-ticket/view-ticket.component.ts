import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BusService } from '../../service/bus.service';
import { TranslateService } from '@ngx-translate/core';
import * as QRCode from 'qrcode';
import {
  bookingStatusInfo,
  displayPnr,
  formatBookingDate,
  formatHour,
  money
} from '../../utils/booking-display';

@Component({
  selector: 'app-view-ticket',
  templateUrl: './view-ticket.component.html',
  styleUrl: './view-ticket.component.css'
})
export class ViewTicketComponent implements OnInit, AfterViewInit {
  pnr: string = '';
  booking: any = null;
  loading: boolean = true;
  error: string = '';
  qrDataUrl: string = '';
  emailing: boolean = false;
  emailSent: boolean = false;
  downloading: boolean = false;

  @ViewChild('barcodeCanvas', { static: false }) barcodeCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private busservice: BusService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.pnr = params['pnr'];
      this.loadTicket();
    });
  }

  ngAfterViewInit(): void {
    if (this.booking && this.barcodeCanvas) {
      this.drawBarcode();
    }
  }

  private loadTicket(): void {
    this.loading = true;
    this.error = '';
    this.qrDataUrl = '';
    this.busservice.getBookingByPnr(this.pnr).subscribe({
      next: (booking) => {
        this.booking = booking;
        this.loading = false;
        const payload = booking?.qrPayload || `TEDTICKET|${displayPnr(booking)}`;
        QRCode.toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
          .then((dataUrl) => (this.qrDataUrl = dataUrl))
          .catch(() => (this.qrDataUrl = ''));
        setTimeout(() => this.drawBarcode(), 50);
      },
      error: () => {
        this.loading = false;
        this.error = this.translate.instant('booking.errNotFound');
      }
    });
  }

  get statusBadge() { return bookingStatusInfo(this.booking); }
  get pnrDisplay() { return displayPnr(this.booking); }

  /** Pseudo-barcode seeded from the PNR so it is stable across renders. */
  drawBarcode(): void {
    const canvas = this.barcodeCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 340;
    const H = 90;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000000';

    let seed = 0;
    const pnr = this.pnrDisplay;
    for (let i = 0; i < pnr.length; i++) seed = (seed * 31 + pnr.charCodeAt(i)) >>> 0;

    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let x = 10;
    while (x < W - 10) {
      const w = 1 + Math.floor(rand() * 3);
      const gap = 1 + Math.floor(rand() * 3);
      ctx.fillRect(x, 6, w, H - 24);
      x += w + gap;
    }

    ctx.font = '13px monospace';
    ctx.fillStyle = '#333';
    ctx.fillText(pnr, (W - ctx.measureText(pnr).width) / 2, H - 6);
  }

  formatDate(d?: string): string { return formatBookingDate(d); }
  formatTime(t?: number | string): string { return formatHour(t); }
  formatMoney(n?: number | string): string { return money(n); }

  seatsLabel(): string {
    const seats = this.booking?.seats || [];
    return seats.length ? seats.map((s: any) => `S${s}`).join(', ') : '--';
  }

  downloadPdf(): void {
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

  printTicket(): void {
    this.busservice.downloadTicketPdf(this.pnr, true).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      },
      error: () => {
        alert(this.translate.instant('booking.errDownload'));
      }
    });
  }

  sendEmail(): void {
    this.emailing = true;
    this.emailSent = false;
    this.busservice.emailTicket(this.pnr).subscribe({
      next: (res) => {
        this.emailing = false;
        this.emailSent = res?.sent === true;
        if (!this.emailSent) alert(this.translate.instant('ticket.emailUnavailable'));
      },
      error: () => {
        this.emailing = false;
        alert(this.translate.instant('ticket.emailUnavailable'));
      }
    });
  }

  goToTrips(): void {
    this.router.navigate(['/profile']);
  }

  backToConfirmation(): void {
    this.router.navigate(['/booking-confirmation', this.pnr]);
  }
}
