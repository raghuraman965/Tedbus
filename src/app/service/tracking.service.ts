import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../config';

export interface TrackingLocation {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
}

export interface TrackingJourney {
  progress: number;
  totalStops: number;
  crossedStops: number;
  currentStopIndex: number;
  remainingStops: number;
  distanceTotal: number;
  distanceCovered: number;
  etaMinutes: number;
  status: 'not_started' | 'in_progress' | 'completed';
  delayMinutes: number;
  departureTime: string;
  arrivalTime: string;
  durationHours: number;
}

export interface TrackingStop {
  name: string;
  sequence: number;
  arrivalTime: string;
  departureTime: string;
  latitude: number;
  longitude: number;
  distanceFromOrigin: number;
  status: 'crossed' | 'current' | 'upcoming';
  etaMinutes: number;
  scheduledTime: string;
}

export interface TrackingData {
  busId: string;
  date: string;
  operatorName: string;
  busType: string;
  routeName: string;
  departureLocation: string;
  arrivalLocation: string;
  currentLocation: TrackingLocation;
  journey: TrackingJourney;
  stops: TrackingStop[];
}

export interface StopTimeline {
  busId: string;
  date: string;
  stops: TrackingStop[];
  summary: {
    total: number;
    crossed: number;
    current: number;
    remaining: number;
  };
}

export interface TrackingBooking {
  bookingId: string;
  pnr: string;
  busId: string;
  routeName: string;
  departureCity: string;
  arrivalCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  seats: number[];
  seatCount: number;
  status: string;
  operatorName: string;
  busType: string;
  trackingAvailable: boolean;
}

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private base = url + 'api/tracking/';

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    let token = '';
    try {
      const raw = sessionStorage.getItem('Loggedinuser');
      if (raw) token = (JSON.parse(raw) as any)?.token || '';
    } catch (e) { token = ''; }
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getTracking(busId: string, date: string): Observable<TrackingData> {
    return this.http.get<TrackingData>(`${this.base}${encodeURIComponent(busId)}/${encodeURIComponent(date)}`);
  }

  getStopTimeline(busId: string, date: string): Observable<StopTimeline> {
    return this.http.get<StopTimeline>(`${this.base}${encodeURIComponent(busId)}/${encodeURIComponent(date)}/stops`);
  }

  getMyBookingsTracking(): Observable<{ bookings: TrackingBooking[] }> {
    return this.http.get<{ bookings: TrackingBooking[] }>(`${this.base}my-bookings`, {
      headers: this.authHeaders()
    });
  }
}
