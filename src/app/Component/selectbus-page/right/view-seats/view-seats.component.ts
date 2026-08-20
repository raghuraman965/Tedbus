import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SeatInfo, buildSeatMap, isSeatBooked, TOTAL_SEATS, SEATS_PER_ROW } from '../../../../model/seat.model';
import { BusService } from '../../../../service/bus.service';
import { AuthService } from '../../../../Premium/services/auth.service';
import { LoginModalComponent } from '../../../../Premium/components/login-modal/login-modal.component';
import { PremiumBookingDrawerComponent } from '../../../../Premium/components/premium-booking-drawer/premium-booking-drawer.component';

@Component({
  selector: 'app-view-seats',
  templateUrl: './view-seats.component.html',
  styleUrl: './view-seats.component.css'
})
export class ViewSeatsComponent implements OnChanges, OnInit, OnDestroy {
  @Input() filledseats: number[] = [];
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

  selectedseats: number[] = [];
  seatMap: SeatInfo[] = [];
  totalSeats = TOTAL_SEATS;
  seatsPerRow = SEATS_PER_ROW;
  proceeding = false;

  @ViewChild('bookingDrawer') drawer?: PremiumBookingDrawerComponent;

  /** Merged sold-seat set (input + live polls). Only ever grows, so a seat
   *  that becomes booked is never silently re-marked available. */
  private filled = new Set<number>();
  private pollTimer: any = null;

  constructor(
    private snackBar: MatSnackBar,
    private translate: TranslateService,
    private busservice: BusService,
    private authService: AuthService,
    private dialog: MatDialog,
    private router: Router
  ) {}

  /** Runs exactly when the seat layout is opened. Queries MongoDB for the
   *  latest sold seats immediately, then refreshes every 12s so a seat booked
   *  by another traveller is flagged live (never cached data). */
  ngOnInit(): void {
    this.syncFilledFromInput();
    this.refreshSoldSeats();
    this.pollTimer = setInterval(() => this.refreshSoldSeats(), 12000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filledseats'] || changes['busid']) {
      this.syncFilledFromInput();
      this.rebuildSeatMap();
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private syncFilledFromInput(): void {
    (this.filledseats || []).forEach((n) => this.filled.add(Number(n)));
  }

  /** Rebuilds the map from the merged sold set and evicts any selected seat
   *  that just became SOLD, telling the user exactly which ones. */
  private rebuildSeatMap(): void {
    this.seatMap = buildSeatMap(this.busid || 'bus', Array.from(this.filled));
    const removed: number[] = [];
    const keep: number[] = [];
    this.selectedseats.forEach((seatNo) => {
      const seat = this.seatMap.find((s) => s.number === seatNo);
      if (seat && !isSeatBooked(seat.status)) {
        seat.status = 'selected';
        keep.push(seatNo);
      } else {
        removed.push(seatNo);
      }
    });
    this.selectedseats = keep;
    if (removed.length) {
      this.showConflictToast(removed);
    }
  }

  /** Fetches the latest sold seats from the backend (GET/POST validate-seats
   *  returns the full sold list even with an empty seats request). */
  refreshSoldSeats(): void {
    if (!this.busid || !this.date) return;
    this.busservice
      .validateSeats({ busId: this.busid, date: this.date, seats: [] })
      .subscribe({
        next: (result: any) => {
          if (result && Array.isArray(result.soldSeats)) {
            this.mergeSoldSeats(result.soldSeats);
          }
        },
        error: () => {
          // Silent: we keep showing the seats we already know about, and the
          // atomic SeatLock + pre-payment revalidation remain the safety net.
        }
      });
  }

  private mergeSoldSeats(sold: number[]): void {
    const before = this.filled.size;
    (sold || []).forEach((n) => this.filled.add(Number(n)));
    if (this.filled.size !== before) {
      this.rebuildSeatMap();
    }
  }

  /** Marks seats as SOLD locally (e.g. after a pre-payment conflict check).
   *  The seats are also added to the authoritative sold set so the next
   *  rebuild of the seat map keeps them disabled — otherwise a poll or input
   *  change could silently resurrect them as available again. */
  markSeatsBooked(seatNos: number[]): void {
    const removed: number[] = [];
    (seatNos || []).forEach((n) => this.filled.add(Number(n)));
    this.seatMap.forEach((seat) => {
      if (seatNos.includes(seat.number)) {
        if (this.selectedseats.includes(seat.number)) {
          removed.push(seat.number);
        }
        seat.status = 'booked';
      }
    });
    if (removed.length) {
      this.selectedseats = this.selectedseats.filter((s) => !removed.includes(s));
      this.showConflictToast(removed);
    }
  }

  /** Drawer reported taken seats — mark them locally and notify the parent. */
  handleSeatsTaken(seatNos: number[]): void {
    this.markSeatsBooked(seatNos);
    this.seatsTaken.emit(seatNos);
  }

  /** Revalidates availability for the exact selected seats before letting the
   *  user open the booking panel. If a seat was just taken, it is marked
   *  Booked, removed from the selection, and a toast explains why — the user
   *  never reaches payment for an unavailable seat.
   *
   *  Auth gate: guests may browse buses and pick seats, but booking (passenger
   *  details → payment) requires a logged-in account. The gate checks the real
   *  auth state here (not just the button's disabled flag) and opens the login
   *  modal. Because the modal is opened in place, the selected seats survive
   *  the login, and the same proceed continues afterwards. The backend also
   *  enforces this (POST /booking & verify-payment return 401 for guests). */
  proceedToBook(): void {
    if (!this.selectedseats.length || this.proceeding) return;
    if (!this.authService.isLoggedIn) {
      this.promptLogin(() => this.proceedToBook());
      return;
    }
    this.proceeding = true;
    this.busservice
      .validateSeats({ busId: this.busid, date: this.date, seats: this.selectedseats })
      .subscribe({
        next: (result: any) => {
          this.proceeding = false;
          if (result && result.success === false && Array.isArray(result.conflicts) && result.conflicts.length) {
            this.markSeatsBooked(result.conflicts);
            this.seatsTaken.emit(result.conflicts);
            return;
          }
          this.openDrawer();
        },
        error: () => {
          // The final atomic SeatLock reservation still rejects double-booking,
          // so a validation outage must never block the flow entirely.
          this.proceeding = false;
          this.openDrawer();
        }
      });
  }

  /** Opens the professional login modal. On success the callback re-runs the
   *  action that was blocked so the user continues without starting over. */
  private promptLogin(onSuccess: () => void): void {
    const ref = this.dialog.open(LoginModalComponent, {
      panelClass: 'premium-dialog-panel',
      autoFocus: false,
      data: { message: 'auth.loginToContinue' }
    });
    ref.afterClosed().subscribe((success: boolean) => {
      if (success && this.authService.isLoggedIn) {
        onSuccess();
      }
    });
  }

  private openDrawer(): void {
    this.drawer?.openDrawer();
  }

  private showConflictToast(seats: number[]): void {
    const single = seats.length === 1;
    const message = single
      ? this.translate.instant('classic.seats.justBookedOne', { seat: seats[0] })
      : this.translate.instant('classic.seats.justBookedMany', { seats: seats.join(', ') });
    this.snackBar.open(message, this.translate.instant('common.close'), {
      duration: 5000,
      panelClass: ['seat-conflict-snackbar'],
    });
  }

  getrowIndices(): number[] {
    return Array.from({ length: this.totalSeats / this.seatsPerRow }, (_, i) => i);
  }

  getSeat(row: number, col: number): SeatInfo {
    const index = row * this.seatsPerRow + col;
    return this.seatMap[index] || { number: index + 1, status: 'available' };
  }

  isseatbooked(seatno: number): boolean {
    const seat = this.seatMap.find(s => s.number === seatno);
    return seat ? isSeatBooked(seat.status) : false;
  }

  isselected(seatno: number): boolean {
    return this.selectedseats.includes(seatno);
  }

  handleselectedseats(seatno: number): void {
    const seat = this.seatMap.find(s => s.number === seatno);
    if (!seat || isSeatBooked(seat.status)) {
      return;
    }
    if (this.selectedseats.includes(seatno)) {
      this.selectedseats = this.selectedseats.filter(item => item !== seatno);
      seat.status = 'available';
    } else {
      this.selectedseats.push(seatno);
      seat.status = 'selected';
    }
  }

  seatStatusClass(seat: SeatInfo): string {
    return seat.status;
  }

  getFareTotal(): number {
    return this.selectedseats.length * this.seatprice;
  }
}
