import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataserviceService } from '../../service/dataservice.service';
import { HttpClient } from '@angular/common/http';
import { BusService } from '../../service/bus.service';
import { FormControl } from '@angular/forms';
import { PaymentSettingsService, PaymentSettings } from '../../service/payment-settings.service';
import { TranslateService } from '@ngx-translate/core';
import { url } from '../../config';
import { formatClockTime, getJourneyDateLabel } from '../../utils/time-utils';

interface PaymentMethod {
  id: string;
  label: string;
  badge?: string;
  icons: string[];
}

type PaymentStage = 'idle' | 'verifying' | 'booking' | 'generating' | 'success' | 'failed';

@Component({
  selector: 'app-payment-page',
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.css'
})
export class PaymentPageComponent implements OnInit {
  passseatarray: any[] = []
  passfare: number = 0
  routedetails: any = []
  busdepauturetime: number = 0
  busarrivaltime: number = 0
  customerid: any = {}
  operatorname: string = ''
  passengerdetails: any = []
  email: string = ''
  fare: number = 0
  busid: string = ''
  phonenumber: string = ''
  departuredetails: any = {}
  arrivaldetails: any = {}
  duration: string = ''
  isbuisnesstravel: boolean = false
  isinsurance: boolean = false
  iscoviddonated: Boolean = false
  bookingdate: string = new Date().toISOString().split('T')[0]

  // Segment-based booking fields (set when user booked an intermediate segment)
  boardingStopSequence: number | null = null
  droppingStopSequence: number | null = null
  boardingStopName: string = ''
  droppingStopName: string = ''
  segmentDistanceKm: number = 0
  fareSnapshot: any = null
  routeId: string = ''

  paymentMethods: PaymentMethod[] = [
    {
      id: 'credit',
      label: 'payment.creditCard',
      icons: [
        'https://st.redbus.in/paas/images/mobile/v2/visa.png',
        'https://st.redbus.in/paas/images/mobile/v2/mastercard.png',
        'https://st.redbus.in/paas/images/web/v2/maestro.png'
      ]
    },
    {
      id: 'debit',
      label: 'payment.debitCard',
      icons: [
        'https://st.redbus.in/paas/images/mobile/v2/visa.png',
        'https://st.redbus.in/paas/images/mobile/v2/mastercard.png',
        'https://st.redbus.in/paas/images/web/v2/maestro.png'
      ]
    },
    {
      id: 'wallets',
      label: 'payment.wallets',
      icons: ['https://st.redbus.in/paas/images/web/v2/amazonpay.png']
    },
    {
      id: 'netbanking',
      label: 'payment.netBanking',
      icons: [
        'https://st.redbus.in/paas/images/web/v2/axis.png',
        'https://st.redbus.in/paas/images/web/v2/sbi.png',
        'https://st.redbus.in/paas/images/web/v2/hdfc.png',
        'https://st.redbus.in/paas/images/web/v2/icici.png',
        'https://st.redbus.in/paas/images/web/v2/kotak.png'
      ]
    },
    {
      id: 'upi',
      label: 'payment.upiId',
      badge: 'payment.new',
      icons: [
        'https://st.redbus.in/paas/images/web/v2/upi/gpay.svg',
        'https://st.redbus.in/paas/images/web/v2/upi/phonepe.svg',
        'https://st.redbus.in/paas/images/web/v2/upi/amazonpay.svg'
      ]
    },
    {
      id: 'qr',
      label: 'payment.qrCode',
      badge: 'payment.new',
      icons: [
        'https://st.redbus.in/paas/images/web/v2/upi/gpay.svg',
        'https://st.redbus.in/paas/images/web/v2/upi/phonepe.svg',
        'https://st.redbus.in/paas/images/web/v2/upi/amazonpay.svg'
      ]
    },
    {
      id: 'stripe',
      label: 'payment.stripe',
      icons: []
    }
  ];

  selectedMethod = new FormControl<string>('');

  paymentSettings: PaymentSettings | null = null;
  qrLoading: boolean = false;
  qrError: string = '';
  processing: boolean = false;
  paymentSuccess: boolean = false;
  paymentError: string = '';
  copied: boolean = false;
  apiBase: string = url;

  // Payment flow state machine.
  paymentStage: PaymentStage = 'idle';
  paymentFailedMessage: string = '';
  bookingResult: any = null;

  private currentPaymentReference: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dataservice: DataserviceService,
    private http: HttpClient,
    private busservice: BusService,
    private paymentSettingsService: PaymentSettingsService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const passSeatsArray = params['selectedseat'];
      const email = params['passemail'];
      const phoneNumber = params['passphn'];
      const isBusinessTravel = params['passisbuisness'];
      const isInsurance = params['passinsurance'];
      const passFare = params['passfare'] ?? params['seatprice'];
      const busId = params['busid'];
      const busArrivalTime = params['busarrivaltime'];
      const busDepartureTime = params['busdeparturetime'];
      const iscoviddonated = params['passiscoviddonate'];
      const operatorname = params['operatorname']
      this.operatorname = operatorname
      const journeyDate = params['date'];
      const routeId = params['routeId'];
      if (journeyDate) {
        this.bookingdate = String(journeyDate);
      }
      this.routeId = routeId || '';
      this.passseatarray = this.parseSeats(passSeatsArray)
      this.email = email
      this.phonenumber = phoneNumber
      this.isbuisnesstravel = isBusinessTravel
      this.isinsurance = isInsurance
      this.passfare = Number(passFare) || 0
      this.busid = busId
      this.busarrivaltime = busArrivalTime
      this.busdepauturetime = busDepartureTime
      this.iscoviddonated = iscoviddonated

      // Segment-based booking params (from premium booking drawer)
      const boardingSeq = params['boardingStopSequence'];
      const droppingSeq = params['droppingStopSequence'];
      if (boardingSeq != null && droppingSeq != null) {
        this.boardingStopSequence = parseInt(boardingSeq, 10);
        this.droppingStopSequence = parseInt(droppingSeq, 10);
        this.boardingStopName = params['boardingStopName'] || '';
        this.droppingStopName = params['droppingStopName'] || '';
        this.segmentDistanceKm = parseFloat(params['segmentDistanceKm']) || 0;
        try {
          this.fareSnapshot = params['fareSnapshot'] ? JSON.parse(params['fareSnapshot']) : null;
        } catch { this.fareSnapshot = null; }
      }

      this.getloggedinuser()
    })

    this.dataservice.currentdata.subscribe(data => {
      this.routedetails = data;
      console.log(data)
    })
    this.dataservice.passdata.subscribe(data => {
      this.passengerdetails = data;
      console.log(data)
    })
  }

  getloggedinuser(): any {
    const loggedinuserjson = sessionStorage.getItem("Loggedinuser");
    if (loggedinuserjson) {
      this.customerid = JSON.parse(loggedinuserjson)
      return this.customerid;
    }
    // Fallback for a session that expired after the page loaded — send the
    // user to login and bring them back to this exact payment URL (which still
    // carries the bus, route, date, passenger count and selected seats).
    this.redirectToLogin();
    return null;
  }

  /** Guards the money step. The BookingAuthGuard normally intercepts guests
   *  before the page renders; this re-check covers a session that expired or
   *  was cleared while the user was already on the page. */
  private requireLoginForPayment(): boolean {
    if (this.customerid && this.customerid._id) {
      return true;
    }
    const restored = this.getloggedinuser();
    if (restored && restored._id) {
      return true;
    }
    this.redirectToLogin();
    return false;
  }

  private redirectToLogin(): void {
    const current = this.router.url;
    sessionStorage.setItem('tedbus_login_redirect', current);
    this.router.navigate(['/login'], {
      queryParams: {
        redirect: current,
        message: 'auth.loginToContinue'
      }
    });
  }

  onMethodChange(id: string): void {
    this.selectedMethod.setValue(id);
    this.copied = false;
    this.paymentError = '';
    this.paymentStage = 'idle';
    if (id === 'qr') {
      this.loadQrSettings();
    }
  }

  loadQrSettings(): void {
    this.qrError = '';
    this.qrLoading = true;
    this.paymentSettingsService.getSettings().subscribe({
      next: (settings) => {
        this.paymentSettings = settings;
        this.qrLoading = false;
      },
      error: () => {
        this.qrLoading = false;
        this.qrError = this.translate.instant('payment.qrLoadError');
      }
    });
  }

  get qrAvailable(): boolean {
    return !!this.paymentSettings &&
      this.paymentSettings.isActive &&
      !!this.paymentSettings.qrImage;
  }

  get qrImageUrl(): string {
    if (!this.paymentSettings?.qrImage) return '';
    return this.paymentSettings.qrImage.startsWith('http')
      ? this.paymentSettings.qrImage
      : this.apiBase + this.paymentSettings.qrImage.replace(/^\//, '');
  }

  copyUpiId(): void {
    if (!this.paymentSettings?.upiId) return;
    const upiId = this.paymentSettings.upiId;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(upiId).then(() => this.showCopied());
    } else {
      const input = document.createElement('input');
      input.value = upiId;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); this.showCopied(); } catch (e) {}
      document.body.removeChild(input);
    }
  }

  private showCopied(): void {
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  private buildBooking(): any {
    const myBooking: any = {};
    myBooking.customerId = this.customerid._id;
    myBooking.passengerDetails = this.passengerdetails;
    myBooking.email = this.customerid.email;
    myBooking.phoneNumber = this.phonenumber;
    myBooking.fare = Number(this.passfare);
    myBooking.status = "upcoming";
    myBooking.busId = this.busid;
    const date = new Date();
    myBooking.bookingDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    myBooking.seats = Array.isArray(this.passseatarray) ? this.passseatarray : this.parseSeats(this.passseatarray);
    myBooking.departureDetails = {
      city: this.routedetails.departureLocation.name,
      time: this.busdepauturetime,
      date: this.bookingdate
    }
    myBooking.arrivalDetails = {
      city: this.routedetails.arrivalLocation.name,
      time: this.busarrivaltime,
      date: this.bookingdate
    }
    myBooking.duration = this.routedetails.duration;
    myBooking.isBusinessTravel = this.isbuisnesstravel;
    myBooking.isInsurance = this.isinsurance;
    myBooking.isCovidDonated = this.iscoviddonated;
    myBooking.paymentReference = this.currentPaymentReference;
    myBooking.paymentMethod = this.selectedMethod.value || 'upi';
    myBooking.routeId = this.routeId;
    return myBooking;
  }

  private buildSegmentBooking(): any {
    const booking = this.buildBooking();
    booking.boardingStopSequence = this.boardingStopSequence;
    booking.droppingStopSequence = this.droppingStopSequence;
    booking.boardingStopName = this.boardingStopName;
    booking.droppingStopName = this.droppingStopName;
    booking.segmentDistanceKm = this.segmentDistanceKm;
    booking.fareSnapshot = this.fareSnapshot;
    booking.routeId = this.routeId;
    return booking;
  }

  private paymentFailed(message: string): void {
    this.processing = false;
    this.paymentFailedMessage = message;
    this.paymentStage = 'failed';
  }

  /** Full flow: validate seats → verify payment → create booking → generate
   *  ticket → navigate to the confirmation page. On any verification failure the
   *  booking is NOT created and the user can retry with a fresh reference. */
  makepayment(): void {
    if (this.processing) return;
    if (!this.requireLoginForPayment()) {
      return;
    }
    if (!this.routedetails || !this.routedetails.departureLocation) {
      this.paymentError = this.translate.instant('payment.errMissingDetails');
      return;
    }
    const seats = Array.isArray(this.passseatarray) ? this.passseatarray : this.parseSeats(this.passseatarray);
    if (!seats.length) {
      this.paymentError = this.translate.instant('booking.errNoSeats');
      return;
    }

    this.processing = true;
    this.paymentError = '';
    this.paymentFailedMessage = '';
    this.bookingResult = null;

    // Pre-charge seat check — a seat taken since the drawer was opened must
    // never be charged for. Backend atomically enforces this too at booking.
    const seatPayload: any = { busId: this.busid, date: this.bookingdate, seats };
    if (this.boardingStopSequence != null && this.droppingStopSequence != null) {
      seatPayload.boardingSequence = this.boardingStopSequence;
      seatPayload.droppingSequence = this.droppingStopSequence;
    }
    this.busservice.validateSeats(seatPayload).subscribe({
      next: (result: any) => {
        if (result && result.success === false && Array.isArray(result.conflicts) && result.conflicts.length) {
          this.processing = false;
          this.paymentError = this.translate.instant('payment.errSeatsTaken', {
            seats: result.conflicts.join(', '),
          });
          return;
        }
        this.startVerifiedPaymentFlow(seats);
      },
      error: () => this.startVerifiedPaymentFlow(seats)
    });
  }

  private startVerifiedPaymentFlow(seats: number[]): void {
    this.paymentStage = 'verifying';
    this.currentPaymentReference = 'REF' + Date.now() + Math.floor(Math.random() * 1e9);

    this.busservice.verifyPayment({
      paymentReference: this.currentPaymentReference,
      customerId: this.customerid._id,
      amount: Number(this.passfare),
      method: this.selectedMethod.value || 'upi'
    }).subscribe({
      next: (verification) => {
        if (!verification || verification.success !== true) {
          this.paymentFailed(this.translate.instant('payment.errVerifyFailed'));
          return;
        }
        this.paymentStage = 'booking';

        // Use segment-aware booking when boarding/dropping sequences are present
        const hasSegmentData = this.boardingStopSequence != null && this.droppingStopSequence != null;
        const bookingCall = hasSegmentData
          ? this.busservice.addSegmentBooking(this.buildSegmentBooking())
          : this.busservice.addbusmongo(this.buildBooking());

        bookingCall.subscribe({
          next: (booking) => {
            this.bookingResult = booking;
            this.paymentStage = 'generating';
            setTimeout(() => {
              this.processing = false;
              this.paymentSuccess = true;
              this.paymentStage = 'success';
              const raw = booking as any;
              const pnr = raw.pnr || String(raw._id || '').slice(-8).toUpperCase();
              this.router.navigate(['/booking-confirmation', pnr]);
            }, 1400);
          },
          error: (error) => {
            console.error('Booking creation failed', error);
            if (error?.status === 409) {
              const seatList = error?.error?.conflictingSeats?.join(', ');
              this.paymentFailed(this.translate.instant('payment.errSeatsTaken', { seats: seatList || '' }));
            } else if (error?.status === 410 || error?.status === 400) {
              this.paymentFailed(error?.error?.error || this.translate.instant('payment.errVerifyFailed'));
            } else {
              this.paymentFailed(this.translate.instant('payment.errGeneric'));
            }
          }
        });
      },
      error: (error) => {
        console.error('Payment verification failed', error);
        if (error?.status === 409 || error?.status === 410) {
          this.paymentFailed(error?.error?.error || this.translate.instant('payment.errVerifyFailed'));
        } else {
          this.paymentFailed(this.translate.instant('payment.errVerifyFailed'));
        }
      }
    });
  }

  payWithStripe(): void {
    this.makepayment();
  }

  payNow(): void {
    this.makepayment();
  }

  completeQrPayment(): void {
    this.makepayment();
  }

  /** Closes the failure panel back to the payment methods so the user can pay
   *  again with a brand-new reference (previous attempt simply expires). */
  retryPayment(): void {
    this.paymentStage = 'idle';
    this.processing = false;
    this.paymentFailedMessage = '';
    this.paymentError = '';
  }

  goToProfile(): void {
    window.location.href = '/profile';
  }

  formatCurrency(amount: number): string {
    return '\u20B9' + (amount || 0).toLocaleString('en-IN');
  }

  formatTime(hour: number | string): string {
    return formatClockTime(hour, {
      am: this.translate.instant('common.am') || 'AM',
      pm: this.translate.instant('common.pm') || 'PM'
    });
  }

  parseSeats(value: any): number[] {
    if (Array.isArray(value)) {
      return value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
    }
    return [];
  }
}
