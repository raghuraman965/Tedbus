import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DataserviceService } from '../../service/dataservice.service';
import { BusService } from '../../service/bus.service';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../Premium/services/auth.service';
import { formatClockTime } from '../../utils/time-utils';
import {
  BookingDraftService,
  DraftTrip,
  DraftPassenger,
} from '../../Premium/services/booking-draft.service';

type PaymentStage = 'idle' | 'verifying' | 'booking' | 'generating' | 'success' | 'failed';

// Fare breakdown shape returned by the server's fare engine. Every value is
// per-seat except totalForSeats (all seats combined).
interface FareBreakdown {
  baseFare?: number;
  seatFare?: number;
  dynamicFare?: number;
  tax?: number;
  serviceFee?: number;
  totalForSeats?: number;
}

@Component({
  selector: 'app-payment-page',
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.css'
})
export class PaymentPageComponent implements OnInit, OnDestroy {
  // Hydrated from the BookingDraft — never from URL params. URL-carried money
  // data was the old flow's biggest hole; the server now owns all of it.
  trip: DraftTrip | null = null;
  passseatarray: number[] = [];
  passengerdetails: DraftPassenger[] = [];
  phonenumber: string = '';
  bookingdate: string = '';
  boardingPointName: string = '';
  droppingPointName: string = '';

  customerid: any = {};
  routedetails: any = {};

  processing: boolean = false;
  paymentSuccess: boolean = false;
  paymentError: string = '';

  // Server-authoritative quote (refreshed from the payment order response so
  // the displayed total ALWAYS equals the charged amount).
  serverQuote: FareBreakdown | null = null;

  // Payment flow state machine.
  paymentStage: PaymentStage = 'idle';
  paymentFailedMessage: string = '';
  bookingResult: any = null;

  // Seat-hold countdown
  holdSecondsLeft: number = 0;
  holdExpired: boolean = false;
  private countdownTimer: any = null;

  private currentPaymentReference: string = '';
  private currentOrder: any = null;

  constructor(
    private router: Router,
    private dataservice: DataserviceService,
    private busservice: BusService,
    private authService: AuthService,
    private translate: TranslateService,
    private draft: BookingDraftService
  ) {}

  ngOnInit(): void {
    this.hydrateFromDraft();

    if (!this.trip || !this.passseatarray.length) {
      // Deep-linked directly without a checkout session — nothing to pay for.
      this.router.navigate(['/']);
      return;
    }

    const user = this.authService.currentUser;
    if (!user || !user._id || !this.authService.token) {
      this.redirectToLogin();
      return;
    }
    this.customerid = user;

    this.startHoldCountdown();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  private hydrateFromDraft(): void {
    const s = this.draft.snapshot;
    this.trip = s.trip;
    this.passseatarray = [...(s.seats || [])];
    this.passengerdetails = [...(s.passengers || [])];
    this.phonenumber = s.phone || '';
    this.boardingPointName = s.boardingPoint || '';
    this.droppingPointName = s.droppingPoint || '';
    this.bookingdate = s.searchContext?.date || s.trip?.segment?.fromStop?.date || '';

    // Hold already gone (tab was closed >10min)? Force a fresh selection.
    if (s.hold && this.draft.holdRemainingMs <= 0) {
      this.holdExpired = true;
      this.draft.clearPaymentState();
    }
  }

  private startHoldCountdown(): void {
    this.updateCountdown();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
  }

  private updateCountdown(): void {
    const ms = this.draft.holdRemainingMs;
    this.holdSecondsLeft = Math.ceil(ms / 1000);
    if (ms <= 0 && !this.holdExpired && this.trip) {
      this.holdExpired = true;
      this.draft.clearPaymentState();
    }
  }

  get holdCountdownLabel(): string {
    const total = Math.max(0, this.holdSecondsLeft);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /** Sends the user back to pick seats again after an expiry. */
  reselectSeats(): void {
    const ctx = this.draft.snapshot.searchContext;
    this.draft.clearPaymentState();
    if (ctx) {
      this.router.navigate(['/view-seats'], {
        queryParams: {
          busId: this.trip?.busId,
          routeId: this.trip?.routeId,
          date: ctx.date,
          from: ctx.from,
          to: ctx.to
        }
      });
    } else {
      this.router.navigate(['/']);
    }
  }

  /** User backs out before paying — give the held seats back immediately. */
  backToSeats(): void {
    const s = this.draft.snapshot;
    if (s.hold && this.trip) {
      this.busservice.releaseSeats(this.trip.busId, s.searchContext?.date || '', s.hold.holdId)
        .subscribe({ complete: () => this.reselectSeats() });
      return;
    }
    this.reselectSeats();
  }

  /** Guards the money step. The BookingAuthGuard normally intercepts guests
   *  before the page renders; this re-check covers a session that expired or
   *  was cleared while the user was already on the page. */
  private requireLoginForPayment(): boolean {
    if (this.customerid && this.customerid._id && this.authService.token) {
      return true;
    }
    this.redirectToLogin();
    return false;
  }

  private redirectToLogin(): void {
    const current = this.router.url;
    try { sessionStorage.setItem('tedbus_login_redirect', current); } catch {}
    try { localStorage.setItem('tedbus_login_redirect_ls', current); } catch {}
    this.router.navigate(['/login'], {
      queryParams: {
        redirect: current,
        message: 'auth.loginToContinue'
      }
    });
  }

  /** Displayed total always comes from the server quote when available. */
  get displayTotal(): number {
    if (this.serverQuote?.totalForSeats != null) {
      return this.serverQuote.totalForSeats;
    }
    if (this.trip) {
      return Math.round(this.trip.farePerSeat.total * this.seatCount);
    }
    return 0;
  }

  get seatCount(): number {
    return Array.isArray(this.passseatarray) ? this.passseatarray.length : 0;
  }

  /** Per-seat ticket fare (base + seat premium + dynamic component). */
  get perSeatFare(): number {
    const q: FareBreakdown = this.serverQuote || (this.trip?.farePerSeat as FareBreakdown) || {};
    return (q.baseFare || 0) + (q.seatFare || 0) + (q.dynamicFare || 0);
  }

  /** Per-seat taxes + service fee, shown as ONE combined line so fees are
   *  never double-counted in the breakup. */
  get feesPerSeat(): number {
    const q: FareBreakdown = this.serverQuote || (this.trip?.farePerSeat as FareBreakdown) || {};
    return (q.tax || 0) + (q.serviceFee || 0);
  }

  readonly razorpayIcons = [
    'https://st.redbus.in/paas/images/web/v2/upi/gpay.svg',
    'https://st.redbus.in/paas/images/mobile/v2/visa.png',
    'https://st.redbus.in/paas/images/mobile/v2/mastercard.png'
  ];

  get operatorname(): string {
    return this.trip?.operatorName || '';
  }

  get boardingDisplayName(): string {
    return this.boardingPointName || this.trip?.segment?.fromStop?.stopName || '';
  }

  get droppingDisplayName(): string {
    return this.droppingPointName || this.trip?.segment?.toStop?.stopName || '';
  }

  get departureTimeDisplay(): string {
    return this.trip?.segment?.departureDateTime
      ? this.formatIsoTime(this.trip.segment.departureDateTime)
      : this.trip?.segment?.fromStop?.departureTime || '';
  }

  get arrivalTimeDisplay(): string {
    return this.trip?.segment?.arrivalDateTime
      ? this.formatIsoTime(this.trip.segment.arrivalDateTime)
      : this.trip?.segment?.toStop?.arrivalTime || '';
  }

  private formatIsoTime(iso: string): string {
    try {
      const d = new Date(iso);
      const h = d.getHours();
      const m = d.getMinutes();
      return formatClockTime(`${h}:${String(m).padStart(2, '0')}`, {
        am: this.translate.instant('common.am') || 'AM',
        pm: this.translate.instant('common.pm') || 'PM'
      });
    } catch {
      return '';
    }
  }

  private paymentFailed(message: string): void {
    this.processing = false;
    this.paymentFailedMessage = message;
    this.paymentStage = 'failed';
  }

  // ── Razorpay ──

  private loadRazorpayScript(): Promise<void> {
    if ((window as any).Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('razorpay-load-failed'));
      document.body.appendChild(script);
    });
  }

  /** Full flow: hold-gated server-priced Razorpay order → Checkout →
   *  signature verification → booking creation against the SAME hold →
   *  confirmation page. A booking is NEVER created unless the gateway
   *  signature verified server-side AND the hold is still alive. */
  makepayment(): void {
    if (this.processing) return;
    if (this.holdExpired || !this.draft.snapshot.hold) {
      this.paymentError = this.translate.instant('booking.holdExpired');
      return;
    }
    if (!this.requireLoginForPayment()) {
      return;
    }
    if (!this.trip) {
      this.paymentError = this.translate.instant('payment.errMissingDetails');
      return;
    }
    const seats = this.passseatarray;
    if (!seats.length) {
      this.paymentError = this.translate.instant('booking.errNoSeats');
      return;
    }

    this.processing = true;
    this.paymentError = '';
    this.paymentFailedMessage = '';
    this.bookingResult = null;
    this.paymentStage = 'verifying';

    this.createOrderAndCheckout(seats);
  }

  private createOrderAndCheckout(seats: number[]): void {
    const ctx = this.draft.snapshot.searchContext;
    const hold = this.draft.snapshot.hold!;
    this.busservice.createPaymentOrder({
      routeId: this.trip!.routeId,
      busId: this.trip!.busId,
      date: ctx?.date || '',
      seats,
      holdId: hold.holdId,
      boardingStopSequence: this.trip!.segment.boardingStopSequence,
      droppingStopSequence: this.trip!.segment.droppingStopSequence,
    }).subscribe({
      next: (order) => {
        // Sync the visible total with the exact amount being charged.
        if (order?.fare) this.serverQuote = order.fare;
        this.currentOrder = order;
        this.currentPaymentReference = order.paymentReference;
        this.draft.setPaymentReference(order.paymentReference);

        this.loadRazorpayScript().then(() => this.openCheckout(order)).catch(() => {
          this.paymentFailed(this.translate.instant('payment.errGatewayLoad'));
        });
      },
      error: (error) => {
        console.error('Payment order failed', error);
        if (error?.status === 409) {
          const reason = error?.error?.reason;
          if (reason === 'HOLD_EXPIRED' || reason === 'HOLD_NOT_FOUND' || reason === 'HOLD_SEAT_MISMATCH') {
            this.draft.clearPaymentState();
            this.paymentFailed(this.translate.instant('booking.holdExpired'));
          } else {
            const seatList = error?.error?.conflictingSeats?.join(', ');
            this.paymentFailed(this.translate.instant('payment.errSeatsTaken', { seats: seatList || '' }));
          }
        } else if (error?.status === 410) {
          this.draft.clearPaymentState();
          this.paymentFailed(error?.error?.error || this.translate.instant('booking.holdExpired'));
        } else {
          this.paymentFailed(error?.error?.error || this.translate.instant('payment.errGeneric'));
        }
      }
    });
  }

  private openCheckout(order: any): void {
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      this.paymentFailed(this.translate.instant('payment.errGatewayLoad'));
      return;
    }

    const options: any = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'TedBus',
      description: `${this.operatorname || 'Bus ticket'} - ${this.formatCurrency(order.amount / 100)}`,
      order_id: order.orderId,
      prefill: {
        name: this.customerid.name || '',
        email: this.customerid.email || '',
        contact: this.phonenumber || this.customerid.phone || ''
      },
      notes: { paymentReference: order.paymentReference },
      theme: { color: '#E53935' },
      handler: (response: any) => this.handlePaymentSuccess(response),
      modal: {
        ondismiss: () => {
          // User closed Checkout without paying — nothing was charged and no
          // booking exists. Return to the payment page so they can retry.
          this.processing = false;
          this.paymentStage = 'idle';
        }
      }
    };

    try {
      const checkout = new Razorpay(options);
      checkout.open();
    } catch (err) {
      console.error('Razorpay open failed', err);
      this.paymentFailed(this.translate.instant('payment.errGatewayLoad'));
    }
  }

  private handlePaymentSuccess(response: any): void {
    if (!response?.razorpay_order_id || !response?.razorpay_payment_id || !response?.razorpay_signature) {
      this.paymentFailed(this.translate.instant('payment.errVerifyFailed'));
      return;
    }
    this.paymentStage = 'verifying';
    this.busservice.confirmPayment({
      paymentReference: this.currentPaymentReference,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    }).subscribe({
      next: () => this.createBookingAfterVerifiedPayment(),
      error: (error) => {
        console.error('Payment confirmation failed', error);
        this.paymentFailed(error?.error?.error || this.translate.instant('payment.errVerifyFailed'));
      }
    });
  }

  private createBookingAfterVerifiedPayment(): void {
    this.paymentStage = 'booking';

    const validPassengers = this.passengerdetails.map((p) => ({
      name: String(p.name || '').trim(),
      age: Number(p.age),
      gender: p.gender || undefined
    }));

    this.busservice.createBooking({
      paymentReference: this.currentPaymentReference,
      holdId: this.draft.snapshot.hold?.holdId || '',
      passengerDetails: validPassengers,
      phoneNumber: this.phonenumber || undefined
    }).subscribe({
      next: (booking) => {
        this.bookingResult = booking;
        this.paymentStage = 'generating';
        setTimeout(() => {
          this.processing = false;
          this.paymentSuccess = true;
          this.paymentStage = 'success';
          const raw = booking as any;
          const pnr = raw.pnr || String(raw._id || '').slice(-8).toUpperCase();
          this.draft.setCreatedBooking(raw);
          this.router.navigate(['/booking-confirmation', pnr]);
        }, 1400);
      },
      error: (error) => {
        console.error('Booking creation failed', error);
        const reason = error?.error?.reason;
        if (reason === 'HOLD_EXPIRED' || error?.status === 410) {
          this.draft.clearPaymentState();
          // Money captured but hold died — backend flagged it for support.
          this.paymentFailed(
            this.translate.instant('payment.errHoldDiedAfterPay') ||
            error?.error?.error ||
            'Your payment succeeded but the seat hold expired. Our support team will process your refund.'
          );
        } else if (reason === 'FARE_MISMATCH') {
          this.paymentFailed(
            error?.error?.error ||
            'Pricing changed during checkout. Your payment will be refunded by support.'
          );
        } else if (error?.status === 409) {
          this.paymentFailed(error?.error?.error || this.translate.instant('payment.errGeneric'));
        } else {
          this.paymentFailed(error?.error?.error || this.translate.instant('payment.errGeneric'));
        }
      }
    });
  }

  /** Closes the failure panel back to the payment methods so the user can pay
   *  again with a brand-new reference (previous attempt simply expires). */
  retryPayment(): void {
    this.paymentStage = 'idle';
    this.processing = false;
    this.paymentFailedMessage = '';
    this.paymentError = '';
    // If the hold is gone there is nothing to retry — force reselection.
    if (this.holdExpired || !this.draft.snapshot.hold) {
      this.reselectSeats();
    }
  }

  goToProfile(): void {
    window.location.href = '/profile';
  }

  formatCurrency(amount: number): string {
    return '\u20B9' + (Math.round((amount || 0) * 100) / 100).toLocaleString('en-IN');
  }

  formatTime(hour: number | string): string {
    return formatClockTime(hour, {
      am: this.translate.instant('common.am') || 'AM',
      pm: this.translate.instant('common.pm') || 'PM'
    });
  }
}
