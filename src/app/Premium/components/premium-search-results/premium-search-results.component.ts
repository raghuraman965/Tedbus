import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BusService } from '../../../service/bus.service';
import { SeatLiveService } from '../../../service/seat-live.service';
import { Bus, SearchBusResult, SearchResult } from '../../../model/bus.model';
import { Route } from '../../../model/routes.model';
import { cardEntrance } from '../../animations/card-entrance';
import { parseTimeToMinutes, addMinutesToDeparture, formatClockTime, formatDuration, getJourneyDateLabel } from '../../../utils/time-utils';

interface EnrichedBus extends Bus {
  avgRating: number;
  totalReviews: number;
  fare: number;
  busTypeLabel: string;
  departureHour: number;
  arrivalHour: number;
  filledSeats: any[];
  availableSeats: number;
  _searchResult?: any;
}

type SortOption = 'price_asc' | 'price_desc' | 'departure_asc' | 'rating_desc';

const TIME_BUCKETS: { [key: string]: [number, number] } = {
  'before6am': [0, 6],
  '6amTo12pm': [6, 12],
  '12pmTo6pm': [12, 18],
  'after6pm': [18, 24]
};

@Component({
  selector: 'app-premium-search-results',
  templateUrl: './premium-search-results.component.html',
  styleUrls: ['./premium-search-results.component.css'],
  animations: [cardEntrance]
})
export class PremiumSearchResultsComponent implements OnInit, OnDestroy {
  departure: string = '';
  arrival: string = '';
  date: string = '';
  passengers: string = '1';

  matchedRoute: Route | null = null;
  allBuses: EnrichedBus[] = [];
  searchResults: SearchBusResult[] = [];
  nextAvailableDates: string[] = [];
  loading: boolean = true;
  errorMessage: string = '';

  expandedBusId: string | null = null;
  showRouteTimeline: { [busId: string]: boolean } = {};

  // Sort
  sortBy: SortOption = 'departure_asc';
  sortOptions: { key: SortOption; label: string }[] = [
    { key: 'departure_asc', label: 'search.sort.departure' },
    { key: 'price_asc', label: 'search.sort.priceLowHigh' },
    { key: 'price_desc', label: 'search.sort.priceHighLow' },
    { key: 'rating_desc', label: 'search.sort.rating' }
  ];

  // Filters
  busTypeFilters: { [key: string]: boolean } = {
    'standard': false,
    'sleeper': false,
    'A/C Seater': false,
    'other': false
  };
  liveTrackingOnly: boolean = false;
  reschedulableOnly: boolean = false;
  departureBuckets: { [key: string]: boolean } = {
    'before6am': false, '6amTo12pm': false, '12pmTo6pm': false, 'after6pm': false
  };
  bucketLabels: { [key: string]: string } = {
    'before6am': 'search.buckets.before6am', '6amTo12pm': 'search.buckets.6amTo12pm', '12pmTo6pm': 'search.buckets.12pmTo6pm', 'after6pm': 'search.buckets.after6pm'
  };
  busTypeKeyMap: { [key: string]: string } = {
    'standard': 'search.types.standard',
    'sleeper': 'search.types.sleeper',
    'A/C Seater': 'search.types.acSeater',
    'other': 'search.types.nonAc'
  };

  // Pagination
  currentPage: number = 1;
  pageSize: number = 5;

  private bookedSub: Subscription | null = null;
  private releasedSub: Subscription | null = null;
  private seatsReady = false;
  private pollTimer: any = null;

  constructor(private route: ActivatedRoute, private router: Router, private busService: BusService, private translate: TranslateService, private seatlive: SeatLiveService) { }

  /** Active language — drives the card entrance replay when language changes. */
  get lang(): string {
    return this.translate.currentLang;
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.departure = params['departure'];
      this.arrival = params['arrival'];
      this.date = params['date'];
      this.passengers = params['passengers'] || '1';
      this.fetchBusesAdvanced();
    });
  }

  ngOnDestroy(): void {
    this.bookedSub?.unsubscribe();
    this.releasedSub?.unsubscribe();
    this.stopPolling();
    this.allBuses.forEach((bus) => {
      if (bus._id && this.date) {
        this.seatlive.leaveBus(bus._id, this.date);
      }
    });
  }

  fetchBusesAdvanced(): void {
    this.loading = true;
    this.errorMessage = '';
    this.busService.searchBuses(this.departure, this.arrival, this.date, parseInt(this.passengers, 10)).subscribe({
      next: (response: SearchResult) => {
        if (response.success && response.buses && response.buses.length > 0) {
          this.searchResults = response.buses;
          this.nextAvailableDates = response.nextAvailableDates || [];
          this.allBuses = response.buses.map(result => this.enrichFromSearchResult(result));
          this.loading = false;
          this.afterSeatsLoaded();
        } else {
          this.nextAvailableDates = response.nextAvailableDates || [];
          this.fetchBusesLegacy();
        }
      },
      error: (error) => {
        console.warn('Advanced search API failed, falling back to legacy:', error);
        this.fetchBusesLegacy();
      }
    });
  }

  private fetchBusesLegacy(): void {
    this.busService.GETBUSDETAILS(this.departure, this.arrival, this.date).subscribe({
      next: (response: any) => {
        this.matchedRoute = response.route;
        const seatsByBusId: { [key: string]: any[] } = response.busidwithseatobj || {};
        const buses: Bus[] = response.matchedBuses || [];
        this.allBuses = buses.map(bus => this.enrichBus(bus, seatsByBusId[bus._id as string] || []));
        this.loading = false;
        this.afterSeatsLoaded();
      },
      error: (error) => {
        console.error('Error fetching buses', error);
        this.errorMessage = this.translate.instant('search.loadError');
        this.loading = false;
      }
    });
  }

  private enrichFromSearchResult(result: SearchBusResult): EnrichedBus {
    const bus = result.bus;
    const totalRating = (bus.rating || []).reduce((sum, r) => sum + r, 0);
    const totalReviews = (bus.rating || []).length || 1;
    const avgRating = +(totalRating / totalReviews).toFixed(1);

    const durationHours = result.segment?.durationMinutes ? result.segment.durationMinutes / 60 : 0;
    // Compute actual per-seat fare from fareConfig
    const fareConfig = result.route?.fareConfig;
    const distance = result.segment?.distanceKm || result.route?.totalDistanceKm || 0;
    const busType = bus.busType || 'standard';

    let fare = 0;
    if (fareConfig) {
      fare = Math.max(fareConfig.baseFare || 0, distance * (fareConfig.pricePerKm || 1.5));
      fare = Math.max(fare, fareConfig.minimumFare || 50);
      const busMultiplier = fareConfig.busTypeMultipliers?.[busType] || 1.0;
      fare = Math.round(fare * busMultiplier);
    } else {
      // Fallback: simple heuristic
      const duration = durationHours;
      if (busType === 'standard') fare = Math.round(50 * Math.floor(duration) / 2);
      else if (busType === 'sleeper') fare = Math.round(100 * Math.floor(duration) / 2);
      else if (busType === 'A/C Seater') fare = Math.round(125 * Math.floor(duration) / 2);
      else fare = Math.round(75 * Math.floor(duration) / 2);
    }

    let busTypeLabel = '';
    if (bus.busType === 'standard') {
      busTypeLabel = this.translate.instant('search.busTypes.standard');
    } else if (bus.busType === 'sleeper') {
      busTypeLabel = this.translate.instant('search.busTypes.sleeper');
    } else if (bus.busType === 'A/C Seater') {
      busTypeLabel = this.translate.instant('search.busTypes.acSeater');
    } else {
      busTypeLabel = this.translate.instant('search.busTypes.nonAc');
    }

    const depMinutes = parseTimeToMinutes(bus.departureTime);
    const durationMinutes = Math.round(durationHours * 60);
    const arrMinutes = addMinutesToDeparture(depMinutes, durationMinutes);
    const totalSeats = result.availability?.totalSeats || bus.totalSeats || 40;
    const filledSeats = result.availability?.soldSeatNumbers || [];
    const availableSeats = result.availability?.availableSeats ?? Math.max(totalSeats - filledSeats.length, 0);

    return {
      ...bus,
      avgRating,
      totalReviews,
      fare,
      busTypeLabel,
      departureHour: depMinutes,
      arrivalHour: arrMinutes,
      filledSeats,
      availableSeats,
      totalSeats,
      _searchResult: result
    };
  }

  fetchBuses(): void {
    this.loading = true;
    this.errorMessage = '';
    this.busService.GETBUSDETAILS(this.departure, this.arrival, this.date).subscribe({
      next: (response: any) => {
        this.matchedRoute = response.route;
        const seatsByBusId: { [key: string]: any[] } = response.busidwithseatobj || {};
        const buses: Bus[] = response.matchedBuses || [];
        this.allBuses = buses.map(bus => this.enrichBus(bus, seatsByBusId[bus._id as string] || []));
        this.loading = false;
        this.afterSeatsLoaded();
      },
      error: (error) => {
        console.error('Error fetching buses', error);
        this.errorMessage = this.translate.instant('search.loadError');
        this.loading = false;
      }
    });
  }

  toggleRouteTimeline(busId: string): void {
    this.showRouteTimeline[busId] = !this.showRouteTimeline[busId];
  }

  searchDate(dateStr: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: dateStr },
      queryParamsHandling: 'merge',
    });
  }

  /** Wires real-time seat events + a light reconciliation poll. */
  private afterSeatsLoaded(): void {
    if (this.seatsReady) return;
    this.seatsReady = true;

    this.bookedSub = this.seatlive.onSeatsBooked().subscribe(({ busId, date, seats }) => {
      if (date !== this.date) return;
      this.updateBusSeats(busId, (current) => {
        const merged = new Set<number>(current);
        (Array.isArray(seats) ? seats : []).forEach((s) => merged.add(Number(s)));
        return Array.from(merged).sort((a, b) => a - b);
      });
    });

    this.releasedSub = this.seatlive.onSeatsReleased().subscribe(({ busId, date, seats }) => {
      if (date !== this.date) return;
      const removed = new Set<number>((Array.isArray(seats) ? seats : []).map(Number));
      this.updateBusSeats(busId, (current) => current.filter((s) => !removed.has(s)));
    });

    (this.allBuses || []).forEach((bus) => {
      if (bus._id && this.date) {
        this.seatlive.joinBus(bus._id, this.date);
      }
    });

    this.startPolling();
  }

  /** Updates a bus's sold-seat list immutably so the seat map re-renders.
   *  Churn-guarded: when the sold list is unchanged the exact same bus object
   *  is returned, so polling never triggers a re-render of that card. */
  private updateBusSeats(busId: string, updater: (current: number[]) => number[]): void {
    this.allBuses = this.allBuses.map((bus) => {
      if (bus._id !== busId) return bus;
      const current: number[] = Array.isArray(bus.filledSeats) ? bus.filledSeats : [];
      const next = updater(current.map(Number));
      const sorted = [...next].sort((a, b) => a - b);
      const prev = [...current.map(Number)].sort((a, b) => a - b);
      const unchanged =
        sorted.length === prev.length &&
        sorted.every((v, i) => v === prev[i]);
      if (unchanged) return bus;
      return {
        ...bus,
        filledSeats: sorted,
        availableSeats: Math.max((bus.totalSeats || 40) - sorted.length, 0),
      };
    });
  }

  /** Drawer conflict — merge the taken seats into the card's sold list. */
  onSeatsTaken(busId: string, seats: number[]): void {
    this.updateBusSeats(busId, (current) => {
      const merged = new Set<number>(current);
      (Array.isArray(seats) ? seats : []).forEach((s) => merged.add(Number(s)));
      return Array.from(merged).sort((a, b) => a - b);
    });
  }

  /** Socket is primary; this lightweight poll only syncs booked-seat data
   *  and never re-creates the page (no reload, no re-navigation, no DOM
   *  churn — see the churn guard in updateBusSeats + trackBy in the template). */
  private startPolling(): void {
    this.stopPolling();
    const reconcile = () => this.reconcileSeats();
    setTimeout(reconcile, 5000);
    this.pollTimer = setInterval(reconcile, 8000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private reconcileSeats(): void {
    if (!this.date) return;
    const busIds = this.allBuses.map((b) => b._id).filter(Boolean) as string[];
    busIds.forEach((busId) => {
      this.busService.validateSeats({ busId, date: this.date, seats: [] }).subscribe({
        next: (res: any) => {
          if (res && Array.isArray(res.soldSeats)) {
            this.updateBusSeats(busId, () =>
              (res.soldSeats as number[]).map(Number).sort((a: number, b: number) => a - b)
            );
          }
        },
        error: () => {}
      });
    });
  }

  private enrichBus(bus: Bus, filledSeats: any[]): EnrichedBus {
    const totalRating = (bus.rating || []).reduce((sum, r) => sum + r, 0);
    const totalReviews = (bus.rating || []).length || 1;
    const avgRating = +(totalRating / totalReviews).toFixed(1);

    const fareConfig = (this.matchedRoute as any)?.fareConfig;
    const totalDistanceKm = (this.matchedRoute as any)?.totalDistanceKm || 0;

    let fare = 0;
    if (fareConfig && totalDistanceKm > 0) {
      fare = Math.max(fareConfig.baseFare || 0, totalDistanceKm * (fareConfig.pricePerKm || 1.5));
      fare = Math.max(fare, fareConfig.minimumFare || 50);
      const busMultiplier = fareConfig.busTypeMultipliers?.[bus.busType] || 1.0;
      fare = Math.round(fare * busMultiplier);
    } else {
      const duration = this.matchedRoute?.duration || 0;
      if (bus.busType === 'standard') fare = Math.round(50 * Math.floor(duration) / 2);
      else if (bus.busType === 'sleeper') fare = Math.round(100 * Math.floor(duration) / 2);
      else if (bus.busType === 'A/C Seater') fare = Math.round(125 * Math.floor(duration) / 2);
      else fare = Math.round(75 * Math.floor(duration) / 2);
    }

    let busTypeLabel = '';
    if (bus.busType === 'standard') {
      busTypeLabel = this.translate.instant('search.busTypes.standard');
    } else if (bus.busType === 'sleeper') {
      busTypeLabel = this.translate.instant('search.busTypes.sleeper');
    } else if (bus.busType === 'A/C Seater') {
      busTypeLabel = this.translate.instant('search.busTypes.acSeater');
    } else {
      busTypeLabel = this.translate.instant('search.busTypes.nonAc');
    }

    const duration = this.matchedRoute?.duration || 0;
    const depMin = parseTimeToMinutes(bus.departureTime);
    const durMin = Math.round(duration * 60);
    const arrMin = addMinutesToDeparture(depMin, durMin);
    const totalSeats = bus.totalSeats || 40;

    const stops = (this.matchedRoute as any)?.stops || [];
    const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
    const _searchResult = {
      bus: bus,
      route: this.matchedRoute,
      segment: {
        fromStop: stops[0] || null,
        toStop: lastStop,
        distanceKm: totalDistanceKm,
        durationMinutes: Math.round((this.matchedRoute?.duration || 0) * 60)
      },
      availability: {
        totalSeats: bus.totalSeats || 40,
        soldSeatNumbers: filledSeats,
        availableSeats: Math.max((bus.totalSeats || 40) - filledSeats.length, 0)
      }
    };

    return {
      ...bus,
      avgRating,
      totalReviews,
      fare,
      busTypeLabel,
      departureHour: depMin,
      arrivalHour: arrMin,
      filledSeats,
      availableSeats: Math.max(totalSeats - filledSeats.length, 0),
      _searchResult
    };
  }

  private matchesBucket(hour: number, bucketKey: string): boolean {
    const [start, end] = TIME_BUCKETS[bucketKey];
    return hour >= start && hour < end;
  }

  get filteredBuses(): EnrichedBus[] {
    const activeBusTypes = Object.keys(this.busTypeFilters).filter(k => this.busTypeFilters[k]);
    const activeDepartureBuckets = Object.keys(this.departureBuckets).filter(k => this.departureBuckets[k]);

    let buses = this.allBuses.filter(bus => {
      if (activeBusTypes.length) {
        const matchesType = activeBusTypes.some(type => {
          if (type === 'other') {
            return !['standard', 'sleeper', 'A/C Seater'].includes(bus.busType);
          }
          return bus.busType === type;
        });
        if (!matchesType) return false;
      }

      if (this.liveTrackingOnly && bus.liveTracking !== 1) return false;
      if (this.reschedulableOnly && bus.reschedulable !== 1) return false;

      if (activeDepartureBuckets.length) {
        const matchesBucket = activeDepartureBuckets.some(bucket => this.matchesBucket(bus.departureHour, bucket));
        if (!matchesBucket) return false;
      }

      return true;
    });

    switch (this.sortBy) {
      case 'price_asc': buses = [...buses].sort((a, b) => a.fare - b.fare); break;
      case 'price_desc': buses = [...buses].sort((a, b) => b.fare - a.fare); break;
      case 'departure_asc': buses = [...buses].sort((a, b) => a.departureHour - b.departureHour); break;
      case 'rating_desc': buses = [...buses].sort((a, b) => b.avgRating - a.avgRating); break;
    }

    return buses;
  }

  get totalPages(): number {
    return Math.max(Math.ceil(this.filteredBuses.length / this.pageSize), 1);
  }

  get pagedBuses(): EnrichedBus[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredBuses.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  setSortBy(option: SortOption): void {
    this.sortBy = option;
    this.currentPage = 1;
  }

  busTypeKey(type: string): string {
    return this.busTypeKeyMap[type] || 'search.types.standard';
  }

  toggleBusType(type: string): void {
    this.busTypeFilters[type] = !this.busTypeFilters[type];
    this.currentPage = 1;
  }

  toggleDepartureBucket(bucket: string): void {
    this.departureBuckets[bucket] = !this.departureBuckets[bucket];
    this.currentPage = 1;
  }

  toggleLiveTracking(): void {
    this.liveTrackingOnly = !this.liveTrackingOnly;
    this.currentPage = 1;
  }

  toggleReschedulable(): void {
    this.reschedulableOnly = !this.reschedulableOnly;
    this.currentPage = 1;
  }

  clearFilters(): void {
    Object.keys(this.busTypeFilters).forEach(k => this.busTypeFilters[k] = false);
    Object.keys(this.departureBuckets).forEach(k => this.departureBuckets[k] = false);
    this.liveTrackingOnly = false;
    this.reschedulableOnly = false;
    this.currentPage = 1;
  }

  toggleSeatSelection(busId: string): void {
    this.expandedBusId = this.expandedBusId === busId ? null : busId;
  }

  /** Reuses existing bus-card DOM across polls so scroll, open seat drawer,
   *  images and per-card timers survive seat-data updates. */
  trackByBusId(_index: number, bus: EnrichedBus): string {
    return bus._id as string;
  }

  getOperatorInitial(name: string): string {
    return (name || 'B').trim().charAt(0).toUpperCase();
  }

  operatorAvatarPalette: string[] = [
    'linear-gradient(135deg, #D84E55, #B93940)',
    'linear-gradient(135deg, #1D6FEB, #0F4CBD)',
    'linear-gradient(135deg, #12A26E, #0A7A52)',
    'linear-gradient(135deg, #F08A24, #D96E08)',
    'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    'linear-gradient(135deg, #0E9AA7, #0B7A85)'
  ];

  avatarColor(index: number): string {
    return this.operatorAvatarPalette[index % this.operatorAvatarPalette.length];
  }

  formatTime(hour: number): string {
    return formatClockTime(hour, this.getAmpmLabels());
  }

  durationMinutes(duration: number): number {
    return Math.round((duration % 1) * 60);
  }

  formatDurationFunc(decimalHours: number): string {
    return formatDuration(decimalHours);
  }

  getJourneyDateLabel(): string {
    return getJourneyDateLabel(this.date);
  }

  private getAmpmLabels(): { am: string; pm: string } {
    return {
      am: this.translate.instant('common.am') || 'AM',
      pm: this.translate.instant('common.pm') || 'PM'
    };
  }

  seatFillPercent(bus: EnrichedBus): number {
    const total = bus.totalSeats || 40;
    return Math.min(Math.max(((total - bus.availableSeats) / total) * 100, 4), 100);
  }
}
