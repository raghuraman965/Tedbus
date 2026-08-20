export interface Bus {
  _id?: string;
  operatorName: string;
  busType: string;
  departureTime: string;
  rating: number[];
  totalSeats?: number;
  routes: string;
  images: string;
  liveTracking: number;
  reschedulable: number;
  operatingDays?: number[];
}

export interface RouteStop {
  stopName: string;
  stopId: string;
  sequence: number;
  departureTime: string;
  arrivalTime: string;
  distanceFromOrigin: number;
  latitude: number;
  longitude: number;
  boardingPoints: string[];
  droppingPoints: string[];
}

export interface FareConfig {
  baseFare: number;
  pricePerKm: number;
  minimumFare: number;
  taxPercent: number;
  serviceFee: number;
  busTypeMultipliers?: Record<string, number>;
  seatTypePremiums?: Record<string, number>;
  dynamicPricing?: {
    enabled: boolean;
    thresholds?: { lowOccupancy: number; midOccupancy: number; highOccupancy: number };
    surcharges?: { low: number; mid: number; high: number; peak: number };
    weekendMultiplier?: number;
    holidayMultiplier?: number;
  };
}

export interface SegmentInfo {
  fromStop: RouteStop;
  toStop: RouteStop;
  distanceKm: number;
  durationMinutes: number;
  durationHours: number;
  boardingPoints: string[];
  droppingPoints: string[];
}

export interface AvailabilityInfo {
  totalSeats: number;
  soldSeats: number;
  availableSeats: number;
  occupancyPercent: number;
  soldSeatNumbers: number[];
}

export interface FareBreakdown {
  baseFare: number;
  seatFare: number;
  dynamicFare: number;
  tax: number;
  serviceFee: number;
  totalFare: number;
  perSeat: number;
  totalForSeats: number;
  pricePerKm: number;
  distance: number;
  breakdown?: any;
}

export interface SearchBusResult {
  bus: Bus;
  route: {
    _id: string;
    routeName: string;
    departureLocation: { name: string; subLocations: string[] };
    arrivalLocation: { name: string; subLocations: string[] };
    totalDistanceKm: number;
    fareConfig: FareConfig;
    stops: RouteStop[];
  };
  segment: SegmentInfo;
  availability: AvailabilityInfo;
  journeyDate: string;
  isToday: boolean;
}

export interface SearchResult {
  success: boolean;
  buses: SearchBusResult[];
  nextAvailableDates: string[];
  searchParams: { from: string; to: string; date: string; passengers: number };
}
