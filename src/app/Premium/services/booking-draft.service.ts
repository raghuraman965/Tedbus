import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * BookingDraft — the SINGLE source of checkout state for the rebuilt flow.
 *
 * Lifecycle: search result picked -> seats selected -> Proceed (seat hold
 * locked) -> payment order opened against the hold -> payment verified ->
 * booking created. The draft survives page reloads and the OTP login redirect
 * via sessionStorage; it is CONVENIENCE ONLY — the server independently
 * re-validates hold + payment + fare on every step, so a stale or tampered
 * draft can never create an invalid booking.
 */
export interface DraftSegment {
  fromStop: any;
  toStop: any;
  boardingStopSequence: number;
  droppingStopSequence: number;
  distanceKm: number;
  durationLabel?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

export interface DraftSearchContext {
  from: string;
  to: string;
  date: string;
  passengers: number;
}

export interface DraftTrip {
  busId: string;
  routeId: string;
  operatorName: string;
  busType: string;
  busNumber?: string;
  image?: string;
  amenities?: string[];
  rating?: number;
  totalSeats?: number;
  segment: DraftSegment;
  /** Server-computed per-seat quote from search / seat-lock. Never client math. */
  farePerSeat: {
    baseFare: number;
    seatFare: number;
    dynamicFare: number;
    tax: number;
    serviceFee: number;
    total: number;
  };
}

export interface DraftHold {
  holdId: string;
  expiresAt: string;
}

export interface DraftPassenger {
  name: string;
  age: number | null;
  gender: 'male' | 'female' | 'other' | '';
}

const STORAGE_KEY = 'tedbus_booking_draft_v1';

@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private readonly _searchContext = new BehaviorSubject<DraftSearchContext | null>(null);
  private readonly _trip = new BehaviorSubject<DraftTrip | null>(null);
  private readonly _seats = new BehaviorSubject<number[]>([]);
  private readonly _boardingPoint = new BehaviorSubject<string>('');
  private readonly _droppingPoint = new BehaviorSubject<string>('');
  private readonly _hold = new BehaviorSubject<DraftHold | null>(null);
  private readonly _passengers = new BehaviorSubject<DraftPassenger[]>([]);
  private readonly _phone = new BehaviorSubject<string>('');
  private readonly _paymentReference = new BehaviorSubject<string>('');
  private readonly _createdBooking = new BehaviorSubject<any | null>(null);

  readonly searchContext$ = this._searchContext.asObservable();
  readonly trip$ = this._trip.asObservable();
  readonly seats$ = this._seats.asObservable();
  readonly boardingPoint$ = this._boardingPoint.asObservable();
  readonly droppingPoint$ = this._droppingPoint.asObservable();
  readonly hold$ = this._hold.asObservable();
  readonly passengers$ = this._passengers.asObservable();
  readonly phone$ = this._phone.asObservable();
  readonly paymentReference$ = this._paymentReference.asObservable();
  readonly createdBooking$ = this._createdBooking.asObservable();

  constructor() {
    this.restore();
  }

  // ===== Setters ===========================================================

  setSearchContext(ctx: DraftSearchContext): void {
    this._searchContext.next(ctx);
    this.persist();
  }

  setTrip(trip: DraftTrip): void {
    // A new trip invalidates everything downstream of search.
    this._trip.next(trip);
    this._hold.next(null);
    this._paymentReference.next('');
    this._createdBooking.next(null);
    if (this._seats.value.length && trip.totalSeats) {
      this._seats.next(this._seats.value.filter((s) => s >= 1 && s <= trip.totalSeats!));
    }
    this.syncPassengerCount();
    this.persist();
  }

  setSeats(seats: number[]): void {
    const unique = Array.from(new Set(seats)).sort((a, b) => a - b);
    this._seats.next(unique);
    this.syncPassengerCount();
    this.persist();
  }

  setBoardingPoint(p: string): void { this._boardingPoint.next(p); this.persist(); }
  setDroppingPoint(p: string): void { this._droppingPoint.next(p); this.persist(); }

  /** Called after POST /booking/seats/lock succeeds. */
  setHold(hold: DraftHold): void {
    this._hold.next(hold);
    this.persist();
  }

  setPassengers(list: DraftPassenger[]): void { this._passengers.next(list); this.persist(); }
  setPhone(phone: string): void { this._phone.next(phone); this.persist(); }
  setPaymentReference(ref: string): void { this._paymentReference.next(ref); this.persist(); }
  setCreatedBooking(booking: any): void { this._createdBooking.next(booking); this.clearSensitive(); }

  // ===== Getters (sync snapshots for guards/templates) =====================

  get snapshot() {
    return {
      searchContext: this._searchContext.value,
      trip: this._trip.value,
      seats: this._seats.value,
      boardingPoint: this._boardingPoint.value,
      droppingPoint: this._droppingPoint.value,
      hold: this._hold.value,
      passengers: this._passengers.value,
      phone: this._phone.value,
      paymentReference: this._paymentReference.value,
      createdBooking: this._createdBooking.value,
    };
  }

  get isCompleteForPayment(): boolean {
    const s = this.snapshot;
    return !!(
      s.trip &&
      s.hold &&
      s.seats.length > 0 &&
      s.passengers.length === s.seats.length &&
      s.passengers.every((p) => p.name.trim().length >= 2 && p.age != null && p.age >= 1 && p.age <= 120)
    );
  }

  get holdRemainingMs(): number {
    const h = this._hold.value;
    if (!h) return 0;
    return Math.max(0, new Date(h.expiresAt).getTime() - Date.now());
  }

  totalFare(): number {
    const { trip, seats } = this.snapshot;
    if (!trip || !seats.length) return 0;
    return Math.round(trip.farePerSeat.total * seats.length);
  }

  // ===== Reset =============================================================

  /** Clears payment/hold state but keeps trip+seats (used after success). */
  private clearSensitive(): void {
    this._hold.next(null);
    this._paymentReference.next('');
    this.persist();
  }

  /** Full teardown — back to square one. */
  reset(): void {
    this._searchContext.next(null);
    this._trip.next(null);
    this._seats.next([]);
    this._boardingPoint.next('');
    this._droppingPoint.next('');
    this._hold.next(null);
    this._passengers.next([]);
    this._phone.next('');
    this._paymentReference.next('');
    this._createdBooking.next(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
  }

  /** Drops only the hold/payment pair (e.g. user edits seats mid-checkout). */
  clearPaymentState(): void {
    this._hold.next(null);
    this._paymentReference.next('');
    this.persist();
  }

  // ===== Persistence =======================================================

  private syncPassengerCount(): void {
    const seats = this._seats.value;
    let list = [...this._passengers.value];
    while (list.length > seats.length) list.pop();
    while (list.length < seats.length) {
      list.push({ name: '', age: null, gender: '' });
    }
    this._passengers.next(list);
  }

  private persist(): void {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          searchContext: this._searchContext.value,
          trip: this._trip.value,
          seats: this._seats.value,
          boardingPoint: this._boardingPoint.value,
          droppingPoint: this._droppingPoint.value,
          hold: this._hold.value,
          passengers: this._passengers.value,
          phone: this._phone.value,
          paymentReference: this._paymentReference.value,
          savedAt: Date.now(),
        })
      );
    } catch (e) { /* storage full/blocked — draft stays in memory */ }
  }

  private restore(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      // Drafts older than 30 minutes are stale by definition: holds live 10.
      if (!d || !d.savedAt || Date.now() - d.savedAt > 30 * 60 * 1000) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      this._searchContext.next(d.searchContext ?? null);
      this._trip.next(d.trip ?? null);
      this._seats.next(Array.isArray(d.seats) ? d.seats : []);
      this._boardingPoint.next(d.boardingPoint ?? '');
      this._droppingPoint.next(d.droppingPoint ?? '');
      this._hold.next(d.hold ?? null);
      this._passengers.next(Array.isArray(d.passengers) ? d.passengers : []);
      this._phone.next(d.phone ?? '');
      this._paymentReference.next(d.paymentReference ?? '');
    } catch (e) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e2) { /* noop */ }
    }
  }
}
