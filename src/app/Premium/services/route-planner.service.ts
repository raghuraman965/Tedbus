import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../../config';
import { AuthService } from './auth.service';

export interface Place {
  placeId?: number;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
}

export interface PlannerRoute {
  index: number;
  distanceKm: number;
  durationMin: number;
  trafficDurationMin: number;
  trafficDelayMin: number;
  trafficLevel: string;
  coordinates: [number, number][];
  description: string;
  legs: number;
}

export interface RouteCalculation {
  routes: PlannerRoute[];
  snapped: Waypoint[];
  traffic: string;
  provider: string;
  cached?: boolean;
}

export interface SavedRoute {
  _id?: string;
  name: string;
  source: string;
  destination: string;
  waypoints: Waypoint[];
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  trafficMode: string;
  stops: number;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RoutePlannerService {
  private base = url + 'api/';

  constructor(private http: HttpClient, private authService: AuthService) { }

  search(query: string): Observable<{ results: Place[]; cached?: boolean; provider?: string }> {
    return this.http.get<{ results: Place[]; cached?: boolean; provider?: string }>(this.base + 'maps/search', {
      params: { q: query }
    });
  }

  calculate(waypoints: Waypoint[]): Observable<RouteCalculation> {
    return this.http.post<RouteCalculation>(this.base + 'maps/route', { waypoints });
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.token;
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getSavedRoutes(): Observable<{ routes: SavedRoute[] }> {
    return this.http.get<{ routes: SavedRoute[] }>(this.base + 'saved-routes', { headers: this.authHeaders() });
  }

  saveRoute(data: Partial<SavedRoute>): Observable<{ route: SavedRoute }> {
    return this.http.post<{ route: SavedRoute }>(this.base + 'saved-routes', data, { headers: this.authHeaders() });
  }

  updateSavedRoute(id: string, data: Partial<SavedRoute>): Observable<{ route: SavedRoute }> {
    return this.http.put<{ route: SavedRoute }>(this.base + 'saved-routes/' + id, data, { headers: this.authHeaders() });
  }

  deleteSavedRoute(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.base + 'saved-routes/' + id, { headers: this.authHeaders() });
  }
}
