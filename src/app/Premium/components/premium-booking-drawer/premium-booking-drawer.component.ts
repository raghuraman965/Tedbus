import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { DataserviceService } from '../../../service/dataservice.service';
import { BusService } from '../../../service/bus.service';
import { AuthService } from '../../services/auth.service';
import {
  BookingDraftService,
  DraftTrip,
} from '../../services/booking-draft.service';
import { LoginModalComponent } from '../login-modal/login-modal.component';
import { formatClockTime, formatDuration, parseTimeToMinutes, addMinutesToDeparture, getJourneyDateLabel } from '../../../utils/time-utils';

interface Passenger {
  name: string;
  age: string;
  gender: string;
  mobile: string;
  email: string;
  id: string;
}

interface TripPoint {
  name: string;
  time: string;
}

@Component({
  selector: 'app-premium-booking-drawer',
  templateUrl: './premium-booking-drawer.component.html',
  styleUrl: './premium-booking-drawer.component.css'
})
export class PremiumBookingDrawerComponent implements OnInit, OnChanges {
  @Input() selectedseat: number[] = [];
  @Input() seatprice: number = 0;
  @Input() routedetails: any;
  @Input() busid: string = '';
  @Input() busarrivaltime: number = 0;
  @Input() busdeparturetime: number = 0;
  @Input() operatorname: string = '';
  @Input() date: string = '';
  @Input() searchResult: any = null;
  @Input() segmentDistance: number = 0;
  @Input() routeId: string = '';
  @Output() seatsTaken = new EventEmitter<number[]>();

  open: boolean = false;
  submitted: boolean = false;
  seatChecking: boolean = false;

  passdetails: Passenger[] = [];
  boardingPoints: TripPoint[] = [];
  droppingPoints: TripPoint[] = [];
  boardingPoint: string = '';
  droppingPoint: string = '';

  passemail: string = '';
  passphn: string = '';

  emergencyName: string = '';
  emergencyPhone: string = '';
  emergencyRelation: string = '';

  gstEnabled: boolean = false;
  gstNumber: string = '';

  dynamicFareInfo: any = null;
  fareLoading: boolean = false;

  constructor(
    private router: Router,
    private dataservice: DataserviceService,
    private translate: TranslateService,
    private busservice: BusService,
    private authService: AuthService,
    private draftService: BookingDraftService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.buildPoints();
    this.buildPassengers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedseat'] && this.open) {
      this.reconcilePassengers();
    }
  }

  get hasSelectedSeats(): boolean {
    return this.selectedseat && this.selectedseat.length > 0;
  }

  openDrawer(): void {
    this.buildPoints();
    this.buildPassengers();
    this.open = true;
    this.fetchFareBreakdown();
  }

  closeDrawer(): void {
    this.open = false;
    this.submitted = false;
  }

  private getAmpmLabels(): { am: string; pm: string } {
    return {
      am: this.translate.instant('common.am') || 'AM',
      pm: this.translate.instant('common.pm') || 'PM'
    };
  }

  private buildPassengers(): void {
    this.passdetails = this.selectedseat.map(() => ({ name: '', age: '', gender: '', mobile: '', email: '', id: '' }));
  }

  private reconcilePassengers(): void {
    const count = (this.selectedseat || []).length;
    const existing = this.passdetails.slice(0, count);
    while (existing.length < count) {
      existing.push({ name: '', age: '', gender: '', mobile: '', email: '', id: '' });
    }
    this.passdetails = existing;
  }

  private buildPoints(): void {
    const labels = this.getAmpmLabels();

    if (this.searchResult?.segment?.fromStop?.boardingPoints?.length) {
      const fromStop = this.searchResult.segment.fromStop;
      this.boardingPoints = fromStop.boardingPoints.map((name: string) => ({
        name,
        time: formatClockTime(parseTimeToMinutes(fromStop.departureTime), labels)
      }));
    } else {
      const dep = this.routedetails?.departureLocation || {};
      const depSubs = dep.subLocations || [];
      this.boardingPoints = (depSubs.length ? depSubs : [this.translate.instant('booking.mainTerminal')])
        .map((name: string, index: number) => ({ name, time: formatClockTime((this.busdeparturetime + index * 30) % (24 * 60), labels) }));
    }

    if (this.searchResult?.segment?.toStop?.droppingPoints?.length) {
      const toStop = this.searchResult.segment.toStop;
      this.droppingPoints = toStop.droppingPoints.map((name: string) => ({
        name,
        time: formatClockTime(parseTimeToMinutes(toStop.arrivalTime), labels)
      }));
    } else {
      const arr = this.routedetails?.arrivalLocation || {};
      const arrSubs = arr.subLocations || [];
      this.droppingPoints = (arrSubs.length ? arrSubs : [this.translate.instant('booking.centralTerminal')])
        .map((name: string, index: number) => ({ name, time: formatClockTime((this.busarrivaltime + index * 30) % (24 * 60), labels) }));
    }

    this.boardingPoint = this.boardingPoints[0]?.name || '';
    this.droppingPoint = this.droppingPoints[0]?.name || '';
  }

  getDepartureFormatted(): string {
    return formatClockTime(this.busdeparturetime, this.getAmpmLabels());
  }

  getArrivalFormatted(): string {
    return formatClockTime(this.busarrivaltime, this.getAmpmLabels());
  }

  getDurationFormatted(): string {
    return formatDuration(this.routedetails?.duration);
  }

  getJourneyDateLabel(): string {
    return getJourneyDateLabel(this.date);
  }

  // ---- Fare ----
  get seatCount(): number {
    return this.selectedseat?.length || 0;
  }

  get baseFare(): number {
    if (this.dynamicFareInfo?.fare?.totalForSeats != null) {
      return this.dynamicFareInfo.fare.totalForSeats;
    }
    return this.seatCount * this.seatprice;
  }

  /** Server fare values are PER SEAT — every displayed line must be scaled by
   *  the seat count so the breakup adds up to the charged total. */
  get seatPremiumTotal(): number {
    return (this.dynamicFareInfo?.fare?.seatFare || 0) * this.seatCount;
  }

  get dynamicFareTotal(): number {
    return (this.dynamicFareInfo?.fare?.dynamicFare || 0) * this.seatCount;
  }

  get taxTotal(): number {
    return (this.dynamicFareInfo?.fare?.tax ?? 0) * this.seatCount;
  }

  get serviceFeeTotal(): number {
    return (this.dynamicFareInfo?.fare?.serviceFee ?? 0) * this.seatCount;
  }

  get gstAmount(): number {
    if (this.dynamicFareInfo?.fare?.tax != null) {
      return this.taxTotal;
    }
    return this.gstEnabled ? Math.round(this.baseFare * 0.05) : 0;
  }

  get serviceFeeAmount(): number {
    return this.serviceFeeTotal;
  }

  get totalFare(): number {
    if (this.dynamicFareInfo?.fare?.totalForSeats != null) {
      return this.dynamicFareInfo.fare.totalForSeats;
    }
    return this.baseFare + this.gstAmount + this.serviceFeeAmount;
  }

  fetchFareBreakdown(): void {
    const segment = this.searchResult?.segment;
    const route = this.searchResult?.route;
    const rid = route?._id || route?.id || this.routeId;
    if (!rid || !segment) return;

    this.fareLoading = true;
    this.busservice
      .calculateFare({
        routeId: rid,
        busId: this.busid,
        date: this.date,
        fromSequence: segment.fromStop?.sequence,
        toSequence: segment.toStop?.sequence,
        seats: this.selectedseat.map(String),
        seatType: 'seater'
      })
      .subscribe({
        next: (res: any) => {
          this.fareLoading = false;
          this.dynamicFareInfo = res;
        },
        error: () => {
          this.fareLoading = false;
        }
      });
  }

  // ---- Validation ----
  isNameValid(name: string): boolean {
    return !!name && name.trim().length >= 2;
  }

  isAgeValid(age: string): boolean {
    const num = Number(age);
    return age !== '' && Number.isInteger(num) && num >= 1 && num <= 120;
  }

  isGenderValid(gender: string): boolean {
    return gender === 'Male' || gender === 'Female' || gender === 'Other';
  }

  isEmailValid(email: string): boolean {
    if (!email || !email.trim()) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  isPhoneValid(phone: string): boolean {
    if (!phone || !phone.trim()) return false;
    return /^[0-9]{10}$/.test(phone.trim());
  }

  isGstValid(gst: string): boolean {
    return /^[0-9A-Z]{15}$/i.test((gst || '').trim());
  }

  private validateForm(): string {
    if (!this.selectedseat || this.selectedseat.length === 0) {
      return this.translate.instant('booking.errNoSeats');
    }
    if (!this.boardingPoint) {
      return this.translate.instant('booking.errBoarding');
    }
    if (!this.droppingPoint) {
      return this.translate.instant('booking.errDropping');
    }
    for (let i = 0; i < this.passdetails.length; i++) {
      const p = this.passdetails[i];
      if (!this.isNameValid(p.name)) {
        return this.translate.instant('booking.errPassengerName', { n: i + 1 });
      }
      if (!this.isAgeValid(p.age)) {
        return this.translate.instant('booking.errPassengerAge', { n: i + 1 });
      }
      if (!this.isGenderValid(p.gender)) {
        return this.translate.instant('booking.errPassengerGender', { n: i + 1 });
      }
      if (!this.isPhoneValid(p.mobile)) {
        return this.translate.instant('booking.errPassengerMobile', { n: i + 1 });
      }
      if (p.email && !this.isEmailValid(p.email)) {
        return this.translate.instant('booking.errPassengerEmail', { n: i + 1 });
      }
    }
    if (!this.isEmailValid(this.passemail)) {
      return this.translate.instant('booking.errTicketEmail');
    }
    if (!this.isPhoneValid(this.passphn)) {
      return this.translate.instant('booking.errTicketPhone');
    }
    if (this.emergencyPhone && !this.isPhoneValid(this.emergencyPhone)) {
      return this.translate.instant('booking.errEmergencyPhone');
    }
    if (this.gstEnabled && this.gstNumber && !this.isGstValid(this.gstNumber)) {
      return this.translate.instant('booking.errGstFull');
    }
    return '';
  }

  continueBooking(): void {
    if (this.seatChecking) return;
    this.submitted = true;
    const error = this.validateForm();
    if (error) {
      alert(error);
      return;
    }

    if (!this.authService.isLoggedIn) {
      const ref = this.dialog.open(LoginModalComponent, {
        panelClass: 'premium-dialog-panel',
        autoFocus: false,
        data: { message: 'auth.loginToContinue' }
      });
      ref.afterClosed().subscribe((success: boolean) => {
        if (success && this.authService.isLoggedIn) {
          this.continueBooking();
        }
      });
      return;
    }

    this.seatChecking = true;
    this.busservice
      .validateSeats({ busId: this.busid, date: this.date, seats: this.selectedseat })
      .subscribe({
        next: (result: any) => {
          if (result && result.success === false && Array.isArray(result.conflicts) && result.conflicts.length) {
            this.seatChecking = false;
            this.seatsTaken.emit(result.conflicts);
            return;
          }
          this.lockSeatsAndContinue();
        },
        error: () => {
          // Pre-check endpoint unavailable — the lock call below still
          // enforces everything server-side, so continue.
          this.lockSeatsAndContinue();
        }
      });
  }

  /** Proceed = LOCK. A 10-minute hold is placed on the exact seats before we
   *  leave this page; the payment page then prices its order against that
   *  hold, so seats can never be double-sold between drawer and gateway. */
  private lockSeatsAndContinue(): void {
    const segment = this.searchResult?.segment;
    const route = this.searchResult?.route;
    const rid = route?._id || route?.id || this.routeId;

    this.busservice
      .lockSeats({
        routeId: rid || '',
        busId: this.busid,
        date: this.date,
        seats: this.selectedseat,
        boardingStopSequence: segment?.fromStop?.sequence ?? 1,
        droppingStopSequence: segment?.toStop?.sequence ?? 9999
      })
      .subscribe({
        next: (hold) => {
          this.seatChecking = false;
          if (!hold?.holdId) {
            alert(this.translate.instant('booking.errGeneric'));
            return;
          }
          this.populateDraft(rid, hold);
          this.router.navigate(['/payment']);
        },
        error: (error) => {
          this.seatChecking = false;
          const conflicts = error?.error?.conflictingSeats || error?.error?.conflicts;
          if (error?.status === 409 && Array.isArray(conflicts) && conflicts.length) {
            this.seatsTaken.emit(conflicts);
            return;
          }
          if (error?.status === 401) {
            const ref = this.dialog.open(LoginModalComponent, {
              panelClass: 'premium-dialog-panel',
              autoFocus: false,
              data: { message: 'auth.loginToContinue' }
            });
            ref.afterClosed().subscribe((success: boolean) => {
              if (success && this.authService.isLoggedIn) {
                this.continueBooking();
              }
            });
            return;
          }
          alert(error?.error?.error || this.translate.instant('booking.errGeneric'));
        }
      });
  }

  /** Writes the full checkout context into the session draft so the payment
   *  page needs NO data from the URL. Money values here are display-only; the
   *  server re-prices authoritatively when the payment order is created. */
  private populateDraft(routeId: string | null, hold: any): void {
    const fare: any = this.dynamicFareInfo?.fare || {};
    const perSeatBase = Number(fare.baseFare) || this.seatprice;
    const seatFare = Number(fare.seatFare) || 0;
    const dynamicFare = Number(fare.dynamicFare) || 0;
    const tax = Number(fare.tax ?? fare.taxes) || 0;
    const serviceFee = Number(fare.serviceFee ?? fare.serviceCharges) || 0;

    const trip: DraftTrip = {
      busId: this.busid,
      routeId: routeId || '',
      operatorName: this.operatorname,
      busType: this.routedetails?.type || this.routedetails?.busType || '',
      totalSeats: this.searchResult?.bus?.totalSeats || this.searchResult?.totalSeats,
      segment: {
        fromStop: this.searchResult?.segment?.fromStop || { stopName: this.boardingPoint },
        toStop: this.searchResult?.segment?.toStop || { stopName: this.droppingPoint },
        boardingStopSequence: this.searchResult?.segment?.fromStop?.sequence ?? 1,
        droppingStopSequence: this.searchResult?.segment?.toStop?.sequence ?? 9999,
        distanceKm: this.segmentDistance || 0
      },
      farePerSeat: {
        baseFare: perSeatBase,
        seatFare,
        dynamicFare,
        tax,
        serviceFee,
        total: perSeatBase + seatFare + dynamicFare + tax + serviceFee
      }
    };

    this.draftService.setSearchContext({
      from: this.searchResult?.searchFrom || this.boardingPoint,
      to: this.searchResult?.searchTo || this.droppingPoint,
      date: this.date,
      passengers: this.selectedseat.length
    });
    this.draftService.setBoardingPoint(this.boardingPoint);
    this.draftService.setDroppingPoint(this.droppingPoint);
    this.draftService.setSeats(this.selectedseat);
    this.draftService.setPassengers(
      this.passdetails.map((p) => ({
        name: String(p.name || '').trim(),
        age: p.age === '' ? null : Number(p.age),
        gender: (p.gender ? p.gender.toLowerCase() : '') as 'male' | 'female' | 'other' | ''
      }))
    );
    this.draftService.setPhone(String(this.passphn || '').trim());
    this.draftService.setTrip(trip);
    this.draftService.setHold({
      holdId: hold.holdId,
      expiresAt: new Date(hold.expiresAt).toISOString()
    });

    // Legacy in-memory channels kept for pages not yet migrated.
    this.dataservice.passobj(this.passdetails);
    this.dataservice.sendobj(this.routedetails);
  }
}
