import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { Subscription, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import {
  RoutePlannerService,
  Place,
  Waypoint,
  PlannerRoute,
  SavedRoute
} from '../../services/route-planner.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService, ThemeMode } from '../../services/theme.service';
import { GoogleMapsService } from '../../services/google-maps.service';
import { CityService } from '../../../shared/city.service';

interface FallbackCity {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
}

const FALLBACK_CITIES: FallbackCity[] = [
  { name: 'Delhi', displayName: 'Delhi, India', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', displayName: 'Mumbai, Maharashtra, India', lat: 19.076, lon: 72.8777 },
  { name: 'Bangalore', displayName: 'Bangalore, Karnataka, India', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', displayName: 'Kolkata, West Bengal, India', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', displayName: 'Chennai, Tamil Nadu, India', lat: 13.0827, lon: 80.2707 },
  { name: 'Jaipur', displayName: 'Jaipur, Rajasthan, India', lat: 26.9124, lon: 75.7873 },
  { name: 'Goa', displayName: 'Goa, India', lat: 15.2993, lon: 74.124 },
  { name: 'Mysore', displayName: 'Mysore, Karnataka, India', lat: 12.2958, lon: 76.6394 },
  { name: 'Darjeeling', displayName: 'Darjeeling, West Bengal, India', lat: 27.041, lon: 88.2663 },
  { name: 'Pondicherry', displayName: 'Pondicherry, India', lat: 11.9416, lon: 79.8083 },
  { name: 'Hyderabad', displayName: 'Hyderabad, Telangana, India', lat: 17.385, lon: 78.4867 },
  { name: 'Pune', displayName: 'Pune, Maharashtra, India', lat: 18.5204, lon: 73.8567 },
  { name: 'Ahmedabad', displayName: 'Ahmedabad, Gujarat, India', lat: 23.0225, lon: 72.5714 },
  { name: 'Kochi', displayName: 'Kochi, Kerala, India', lat: 9.9312, lon: 76.2673 },
  { name: 'Varanasi', displayName: 'Varanasi, Uttar Pradesh, India', lat: 25.3176, lon: 82.9739 },
  { name: 'Shimla', displayName: 'Shimla, Himachal Pradesh, India', lat: 31.1048, lon: 77.1734 }
];

type SearchTarget = 'source' | 'destination' | 'stop' | null;

@Component({
  selector: 'app-route-planner',
  templateUrl: './route-planner.component.html',
  styleUrls: ['./route-planner.component.css']
})
export class RoutePlannerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapDiv', { static: false }) mapDiv!: ElementRef<HTMLDivElement>;

  sourceQuery = '';
  destinationQuery = '';
  stopQuery = '';
  sourcePlace: Place | null = null;
  destinationPlace: Place | null = null;
  stops: Waypoint[] = [];

  activeSearch: SearchTarget = null;
  suggestions: Place[] = [];
  private searchInput = new Subject<{ target: SearchTarget; query: string }>();
  private searchSub?: Subscription;

  private gmap: any = null;
  private map: any = null;
  private markers: any[] = [];
  private polylines: any[] = [];
  private autocompleteServices: any = {};
  private placesServices: any = {};
  private autocompleteListeners: any[] = [];
  theme: ThemeMode = 'light';
  mapPickMode = false;
  mapsLoading = false;
  mapsReady = false;
  mapsLoadError = false;

  isLoading = false;
  errorMessage = '';
  routes: PlannerRoute[] = [];
  snapped: Waypoint[] = [];
  selectedRouteIndex = 0;
  cached = false;
  trafficProvider = '';

  trafficLayerVisible = false;
  private trafficLayer: any = null;

  currentLocationMarker: any = null;
  locating = false;

  sortBy: 'recommended' | 'fastest' | 'shortest' | 'leastTraffic' = 'recommended';

  trafficChanged = false;
  previousTrafficDelay = 0;

  savedRoutes: SavedRoute[] = [];
  savedRoutesLoaded = false;
  savedRoutesVisible = false;
  deletingSavedId: string | null = null;

  showSaveForm = false;
  saveName = '';
  saving = false;

  private themeSub?: Subscription;
  private querySub?: Subscription;
  private trafficRefreshTimer: any = null;
  private currentSearchId = 0;

  constructor(
    private routePlannerService: RoutePlannerService,
    private authService: AuthService,
    private themeService: ThemeService,
    private googleMapsService: GoogleMapsService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private translate: TranslateService,
    private cityService: CityService
  ) { }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  get hasRoute(): boolean {
    return this.routes.length > 0 && !!this.selectedRoute;
  }

  get selectedRoute(): PlannerRoute | null {
    return this.routes[this.selectedRouteIndex] || null;
  }

  get totalStops(): number {
    return this.stops.length + 2;
  }

  get summaryFrom(): string {
    return this.cityService.toCanonical(
      this.sourceQuery.trim() || (this.sourcePlace ? this.sourcePlace.name : this.translate.instant('routePlanner.start'))
    );
  }

  get summaryTo(): string {
    return this.cityService.toCanonical(
      this.destinationQuery.trim() || (this.destinationPlace ? this.destinationPlace.name : this.translate.instant('routePlanner.end'))
    );
  }

  get trafficModeLabel(): string {
    if (this.trafficProvider === 'google') return this.translate.instant('routePlanner.realtime');
    return this.translate.instant('routePlanner.estimated');
  }

  ngOnInit(): void {
    this.mapsLoading = true;

    this.searchSub = this.searchInput.pipe(debounceTime(350)).subscribe(({ target, query }) => {
      this.performSearch(target, query);
    });

    this.themeSub = this.themeService.theme$.subscribe(mode => {
      this.theme = mode;
      if (this.map) {
        this.map.setOptions({
          styles: mode === 'dark' ? this.darkMapStyle : this.lightMapStyle
        });
      }
    });

    this.querySub = this.route.queryParams.subscribe(params => {
      const id = params['route'];
      if (id) {
        this.loadSavedRoute(id);
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.themeSub?.unsubscribe();
    this.querySub?.unsubscribe();
    if (this.trafficRefreshTimer) clearInterval(this.trafficRefreshTimer);
    this.autocompleteListeners.forEach(l => l?.remove());
    this.autocompleteListeners = [];
  }

  // ========================================================================
  // GOOGLE MAPS SETUP
  // ========================================================================

  private async initMap(): Promise<void> {
    if (!this.mapDiv || !this.mapDiv.nativeElement) return;
    this.mapsLoading = true;
    this.mapsLoadError = false;
    try {
      await this.googleMapsService.load();
      const g = this.googleMapsService.google;
      this.gmap = g;

      this.map = new g.maps.Map(this.mapDiv.nativeElement, {
        center: { lat: 21.7679, lng: 78.8718 },
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: this.theme === 'dark' ? this.darkMapStyle : this.lightMapStyle,
        gestureHandling: 'greedy'
      });

      this.map.addListener('click', (e: any) => {
        if (this.mapPickMode && e.latLng) {
          this.addStopFromMap(e.latLng.lat(), e.latLng.lng());
        }
      });

      this.mapsReady = true;
      this.mapsLoading = false;
      this.initAutocompletes();
    } catch (err) {
      console.error('[RoutePlanner] Google Maps load failed:', err);
      this.mapsLoadError = true;
      this.mapsReady = false;
      this.mapsLoading = false;
    }
  }

  retryMapsLoad(): void {
    this.googleMapsService.reset();
    this.initMap();
  }

  // ========================================================================
  // TRAFFIC LAYER TOGGLE
  // ========================================================================

  toggleTrafficLayer(): void {
    if (!this.gmap || !this.map) return;
    if (!this.trafficLayer) {
      this.trafficLayer = new this.gmap.maps.TrafficLayer();
    }
    if (this.trafficLayerVisible) {
      this.trafficLayer.setMap(null);
      this.trafficLayerVisible = false;
    } else {
      this.trafficLayer.setMap(this.map);
      this.trafficLayerVisible = true;
    }
  }

  // ========================================================================
  // CURRENT LOCATION
  // ========================================================================

  getCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.snackBar.open(this.translate.instant('routePlanner.geolocationNotSupported'), this.translate.instant('common.ok'), { duration: 3000 });
      return;
    }
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating = false;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.dropCurrentLocationMarker(lat, lng);
      },
      (err) => {
        this.locating = false;
        let msgKey = 'routePlanner.locationError';
        if (err.code === err.PERMISSION_DENIED) msgKey = 'routePlanner.locationPermissionDenied';
        else if (err.code === err.TIMEOUT) msgKey = 'routePlanner.locationTimeout';
        this.snackBar.open(this.translate.instant(msgKey), this.translate.instant('common.ok'), { duration: 4000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  private dropCurrentLocationMarker(lat: number, lng: number): void {
    if (!this.map || !this.gmap) return;
    if (this.currentLocationMarker) {
      this.currentLocationMarker.setMap(null);
    }
    const g = this.gmap;
    this.currentLocationMarker = new g.maps.Marker({
      position: { lat, lng },
      map: this.map,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        fillColor: '#4285F4',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
        scale: 10
      },
      title: this.translate.instant('routePlanner.currentLocation')
    });
    this.map.panTo({ lat, lng });
    if (this.map.getZoom() < 12) this.map.setZoom(13);
  }

  private initAutocompletes(): void {
    if (!this.gmap || !this.gmap.maps?.places) return;
    const pc = this.gmap.maps.places.AutocompleteService;
    this.autocompleteServices.source = new pc();
    this.autocompleteServices.destination = new pc();
    this.autocompleteServices.stop = new pc();
  }

  // ========================================================================
  // PLACE SEARCH / AUTOCOMPLETE
  // ========================================================================

  openSearch(target: SearchTarget): void {
    this.activeSearch = target;
    const query = target === 'source' ? this.sourceQuery : target === 'destination' ? this.destinationQuery : this.stopQuery;
    if (query.trim().length >= 2) {
      this.performSearch(target, query);
    }
  }

  closeSearch(): void {
    setTimeout(() => {
      this.activeSearch = null;
      this.suggestions = [];
    }, 180);
  }

  onInput(target: SearchTarget, value: string): void {
    if (target === 'source') this.sourcePlace = null;
    else if (target === 'destination') this.destinationPlace = null;
    this.searchInput.next({ target, query: value });
  }

  private localFallback(query: string): Place[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FALLBACK_CITIES
      .filter(c => this.cityService.matches(c.name, query) || this.cityService.matches(c.displayName, query))
      .map(c => ({
        name: c.name,
        displayName: c.displayName,
        lat: c.lat,
        lon: c.lon,
        type: 'city'
      }));
  }

  private performSearch(target: SearchTarget, query: string): void {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) {
      this.suggestions = [];
      return;
    }

    const searchId = ++this.currentSearchId;

    const ac = this.autocompleteServices[target || 'source'];
    if (ac) {
      const req = { input: trimmed, componentRestrictions: { country: 'in' } };
      ac.getQueryPredictions(req, (predictions: any[] | null, status: any) => {
        if (searchId !== this.currentSearchId) return;
        if (predictions && predictions.length) {
          this.suggestions = predictions.map((p: any) => ({
            name: p.structured_formatting?.main_text || p.description,
            displayName: p.description || p.structured_formatting?.main_text || trimmed,
            lat: 0,
            lon: 0,
            placeId: p.place_id,
            type: p.types?.[0] || 'place'
          }));
        } else {
          this.suggestions = this.localFallback(trimmed);
        }
        this.activeSearch = target;
      });
      return;
    }

    this.routePlannerService.search(trimmed).subscribe({
      next: (res) => {
        if (searchId !== this.currentSearchId) return;
        const remote = res.results || [];
        const merged: Place[] = [...remote];
        for (const c of this.localFallback(trimmed)) {
          if (!merged.some(m => m.lat === c.lat && m.lon === c.lon)) merged.push(c);
        }
        this.suggestions = merged.slice(0, 8);
        this.activeSearch = target;
      },
      error: () => {
        if (searchId !== this.currentSearchId) return;
        this.suggestions = this.localFallback(trimmed);
        this.activeSearch = target;
      }
    });
  }

  selectSuggestion(target: SearchTarget, place: Place): void {
    if (place.lat === 0 && place.lon === 0 && place.placeId && this.gmap?.maps?.places) {
      const svc = new this.gmap.maps.places.PlacesService(document.createElement('div'));
      svc.getDetails({ placeId: place.placeId }, (result: any, status: any) => {
        if (status === 'OK' && result?.geometry?.location) {
          const loc = result.geometry.location;
          const resolved: Place = {
            name: place.name,
            displayName: place.displayName,
            lat: loc.lat(),
            lon: loc.lng(),
            placeId: place.placeId,
            type: place.type
          };
          this.applySelection(target, resolved);
        }
      });
      return;
    }
    this.applySelection(target, place);
  }

  private applySelection(target: SearchTarget, place: Place): void {
    if (target === 'source') {
      this.sourceQuery = place.displayName;
      this.sourcePlace = place;
    } else if (target === 'destination') {
      this.destinationQuery = place.displayName;
      this.destinationPlace = place;
    } else {
      this.stops.push({ name: place.displayName, lat: place.lat, lon: place.lon });
      this.stopQuery = '';
    }
    this.activeSearch = null;
    this.suggestions = [];
    this.recalculate();
  }

  // ========================================================================
  // WAYPOINT MANAGEMENT
  // ========================================================================

  swapPlaces(): void {
    const q = this.sourceQuery;
    const p = this.sourcePlace;
    this.sourceQuery = this.destinationQuery;
    this.sourcePlace = this.destinationPlace;
    this.destinationQuery = q;
    this.destinationPlace = p;
    this.recalculate();
  }

  toggleMapPick(): void {
    this.mapPickMode = !this.mapPickMode;
    if (this.mapPickMode && this.map) {
      this.map.setOptions({ draggableCursor: 'crosshair' });
    } else if (this.map) {
      this.map.setOptions({ draggableCursor: '' });
    }
  }

  private addStopFromMap(lat: number, lon: number): void {
    const index = this.stops.length + 2;
    this.stops.push({ name: this.translate.instant('routePlanner.stop', { n: index }), lat, lon });
    this.mapPickMode = false;
    if (this.map) this.map.setOptions({ draggableCursor: '' });
    this.recalculate();
  }

  moveStop(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.stops.length) return;
    const tmp = this.stops[index];
    this.stops[index] = this.stops[target];
    this.stops[target] = tmp;
    this.recalculate();
  }

  removeStop(index: number): void {
    this.stops.splice(index, 1);
    this.recalculate();
  }

  clearAll(): void {
    this.sourceQuery = '';
    this.destinationQuery = '';
    this.stopQuery = '';
    this.sourcePlace = null;
    this.destinationPlace = null;
    this.stops = [];
    this.routes = [];
    this.selectedRouteIndex = 0;
    this.snapped = [];
    this.errorMessage = '';
    this.showSaveForm = false;
    this.sortBy = 'recommended';
    this.trafficChanged = false;
    this.clearMapOverlays();
    if (this.currentLocationMarker) {
      this.currentLocationMarker.setMap(null);
      this.currentLocationMarker = null;
    }
    if (this.map) this.map.setCenter({ lat: 21.7679, lng: 78.8718 });
    if (this.map) this.map.setZoom(5);
  }

  private orderedWaypoints(): Waypoint[] {
    const list: Waypoint[] = [];
    if (this.sourcePlace) {
      list.push({ name: this.cityService.toCanonical(this.sourceQuery.trim() || this.sourcePlace.name), lat: this.sourcePlace.lat, lon: this.sourcePlace.lon });
    }
    for (const s of this.stops) list.push(s);
    if (this.destinationPlace) {
      list.push({ name: this.cityService.toCanonical(this.destinationQuery.trim() || this.destinationPlace.name), lat: this.destinationPlace.lat, lon: this.destinationPlace.lon });
    }
    return list;
  }

  // ========================================================================
  // ROUTE CALCULATION
  // ========================================================================

  recalculate(isRefresh = false): void {
    const waypoints = this.orderedWaypoints();
    if (waypoints.length < 2) {
      this.routes = [];
      this.selectedRouteIndex = 0;
      this.snapped = [];
      this.clearMapOverlays();
      this.drawMarkers(waypoints);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.cached = false;
    this.routePlannerService.calculate(waypoints).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.routes = this.scoreRoutes(res.routes || []);
        this.snapped = res.snapped || [];
        this.cached = !!res.cached;
        this.trafficProvider = res.provider || '';
        this.selectedRouteIndex = 0;

        if (isRefresh && this.previousTrafficDelay > 0) {
          const newDelay = this.routes[0]?.trafficDelayMin || 0;
          if (Math.abs(newDelay - this.previousTrafficDelay) >= 2) {
            this.trafficChanged = true;
          }
        }

        this.drawMarkers(waypoints);
        this.drawSelectedRoute(this.routes[this.selectedRouteIndex]);
        if (!isRefresh) this.startTrafficRefresh();
      },
      error: () => {
        this.isLoading = false;
        this.routes = [];
        this.errorMessage = this.translate.instant('routePlanner.calcError');
        this.drawMarkers(waypoints);
      }
    });
  }

  selectRoute(index: number): void {
    if (index < 0 || index >= this.routes.length) return;
    this.selectedRouteIndex = index;
    this.drawSelectedRoute(this.routes[index]);
  }

  sortRoutes(by: 'recommended' | 'fastest' | 'shortest' | 'leastTraffic'): void {
    if (this.routes.length <= 1) return;
    this.sortBy = by;
    let sorted: PlannerRoute[];
    switch (by) {
      case 'fastest':
        sorted = [...this.routes].sort((a, b) => a.durationMin - b.durationMin);
        break;
      case 'shortest':
        sorted = [...this.routes].sort((a, b) => a.distanceKm - b.distanceKm);
        break;
      case 'leastTraffic':
        sorted = [...this.routes].sort((a, b) => a.trafficDurationMin - b.trafficDurationMin);
        break;
      default:
        sorted = this.scoreRoutes(this.routes);
        break;
    }
    this.routes = sorted;
    this.selectedRouteIndex = 0;
    this.drawSelectedRoute(this.routes[0]);
  }

  private scoreRoutes(routes: PlannerRoute[]): PlannerRoute[] {
    return [...routes].sort((a, b) => {
      const scoreA = a.trafficDurationMin * 0.6 + a.distanceKm * 0.3 + a.trafficDelayMin * 0.1;
      const scoreB = b.trafficDurationMin * 0.6 + b.distanceKm * 0.3 + b.trafficDelayMin * 0.1;
      return scoreA - scoreB;
    });
  }

  dismissTrafficNotice(): void {
    this.trafficChanged = false;
  }

  private startTrafficRefresh(): void {
    if (this.trafficRefreshTimer) clearInterval(this.trafficRefreshTimer);
    this.trafficRefreshTimer = setInterval(() => {
      const waypoints = this.orderedWaypoints();
      if (waypoints.length >= 2) {
        const oldDelay = this.selectedRoute?.trafficDelayMin || 0;
        this.previousTrafficDelay = oldDelay;
        this.recalculate(true);
      }
    }, 5 * 60 * 1000);
  }

  refreshTraffic(): void {
    this.recalculate();
  }

  private drawSelectedRoute(route?: PlannerRoute): void {
    this.clearMapOverlays();
    if (!route || !this.map || !this.gmap) return;
    const g = this.gmap;

    for (const alt of this.routes) {
      if (alt.index === route.index) continue;
      if (alt.coordinates.length < 2) continue;
      const altLine = new g.maps.Polyline({
        path: alt.coordinates.map((c: [number, number]) => ({ lat: c[0], lng: c[1] })),
        strokeColor: this.theme === 'dark' ? '#6B6B76' : '#B9BCC7',
        strokeWeight: 4,
        strokeOpacity: 0.45,
        map: this.map,
        clickable: false
      });
      this.polylines.push(altLine);
    }

    if (route.coordinates.length < 2) return;
    const path = route.coordinates.map((c: [number, number]) => ({ lat: c[0], lng: c[1] }));
    const line = new g.maps.Polyline({
      path,
      strokeColor: '#1D6FEB',
      strokeWeight: 6,
      strokeOpacity: 0.95,
      map: this.map,
      clickable: false
    });
    this.polylines.push(line);

    const bounds = new g.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    this.map.fitBounds(bounds, 60);
  }

  private drawMarkers(waypoints: Waypoint[]): void {
    if (!this.map || !this.gmap) return;
    const g = this.gmap;

    this.markers.forEach(m => m.setMap(null));
    this.markers = [];

    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    waypoints.forEach((wp, index) => {
      const isFirst = index === 0;
      const isLast = index === waypoints.length - 1;
      const label = isFirst ? 'A' : isLast ? 'B' : labels[index] || String(index);
      const color = isFirst ? '#2E9E56' : isLast ? '#D84E55' : '#1D6FEB';

      const marker = new g.maps.Marker({
        position: { lat: wp.lat, lng: wp.lon },
        map: this.map,
        label: { text: label, color: '#fff', fontSize: '13px', fontWeight: 'bold' },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          scale: 14
        },
        title: wp.name
      });
      this.markers.push(marker);
    });
  }

  private clearMapOverlays(): void {
    this.polylines.forEach(p => p?.setMap(null));
    this.polylines = [];
    this.markers.forEach(m => m?.setMap(null));
    this.markers = [];
  }

  // ========================================================================
  // SAVED ROUTES
  // ========================================================================

  private loadSavedRoute(id: string): void {
    if (!this.authService.isLoggedIn) {
      this.snackBar.open(this.translate.instant('routePlanner.loginToView'), this.translate.instant('common.ok'), { duration: 3000 });
      return;
    }
    this.routePlannerService.getSavedRoutes().subscribe({
      next: (res) => {
        const saved = (res.routes || []).find(r => r._id === id);
        if (!saved) {
          this.snackBar.open(this.translate.instant('routePlanner.savedRouteNotFound'), this.translate.instant('common.ok'), { duration: 3000 });
          return;
        }
        this.sourceQuery = saved.source;
        this.destinationQuery = saved.destination;
        this.sourcePlace = saved.waypoints[0] ? { name: saved.source, displayName: saved.source, lat: saved.waypoints[0].lat, lon: saved.waypoints[0].lon } : null;
        this.destinationPlace = saved.waypoints[saved.waypoints.length - 1]
          ? { name: saved.destination, displayName: saved.destination, lat: saved.waypoints[saved.waypoints.length - 1].lat, lon: saved.waypoints[saved.waypoints.length - 1].lon }
          : null;
        this.stops = (saved.waypoints || []).slice(1, -1).map(w => ({ name: w.name, lat: w.lat, lon: w.lon }));
        if (saved.geometry && saved.geometry.length) {
          this.routes = [{
            index: 0,
            distanceKm: saved.distanceKm,
            durationMin: saved.durationMin,
            trafficDurationMin: saved.durationMin,
            trafficDelayMin: 0,
            trafficLevel: 'estimated',
            coordinates: saved.geometry,
            description: '',
            legs: saved.waypoints.length
          }];
          this.selectedRouteIndex = 0;
          this.drawMarkers(this.orderedWaypoints());
          this.drawSelectedRoute(this.routes[0]);
        } else {
          this.recalculate();
        }
      },
      error: () => {
        this.snackBar.open(this.translate.instant('routePlanner.loadSavedError'), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  openSaveForm(): void {
    if (!this.authService.isLoggedIn) {
      this.snackBar.open(this.translate.instant('routePlanner.pleaseLoginToSave'), this.translate.instant('common.login'), { duration: 4000 }).onAction().subscribe(() => {
        this.router.navigate(['/login']);
      });
      return;
    }
    this.saveName = this.summaryFrom && this.summaryTo ? `${this.summaryFrom}${this.translate.instant('savedRoutes.to')}${this.summaryTo}` : this.translate.instant('routePlanner.mySavedRoute');
    this.showSaveForm = true;
  }

  saveCurrentRoute(): void {
    const route = this.selectedRoute;
    if (!route || this.saving) return;
    const waypoints = this.orderedWaypoints();
    this.saving = true;
    this.routePlannerService.saveRoute({
      name: this.saveName.trim() || `${this.summaryFrom}${this.translate.instant('savedRoutes.to')}${this.summaryTo}`,
      source: this.summaryFrom,
      destination: this.summaryTo,
      waypoints,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      geometry: route.coordinates.slice(0, 500),
      trafficMode: this.trafficProvider === 'google' ? 'realtime' : 'estimated',
      stops: waypoints.length
    }).subscribe({
      next: () => {
        this.saving = false;
        this.showSaveForm = false;
        this.snackBar.open(this.translate.instant('routePlanner.savedSuccess'), this.translate.instant('common.ok'), { duration: 3000 });
      },
      error: () => {
        this.saving = false;
        this.snackBar.open(this.translate.instant('routePlanner.saveError'), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  loadSavedRoutes(): void {
    if (!this.authService.isLoggedIn) return;
    if (!this.savedRoutesVisible) {
      this.savedRoutesVisible = true;
      if (!this.savedRoutesLoaded) {
        this.routePlannerService.getSavedRoutes().subscribe({
          next: (res) => {
            this.savedRoutes = res.routes || [];
            this.savedRoutesLoaded = true;
          },
          error: () => {
            this.savedRoutesLoaded = true;
          }
        });
      }
    } else {
      this.savedRoutesVisible = false;
    }
  }

  openSavedRoute(saved: SavedRoute): void {
    if (!saved._id) return;
    this.router.navigate([], { queryParams: { route: saved._id }, queryParamsHandling: 'merge' });
  }

  deleteSavedRoute(id: string): void {
    if (!id || this.deletingSavedId) return;
    this.deletingSavedId = id;
    this.routePlannerService.deleteSavedRoute(id).subscribe({
      next: () => {
        this.savedRoutes = this.savedRoutes.filter(r => r._id !== id);
        this.deletingSavedId = null;
        this.snackBar.open(this.translate.instant('routePlanner.deletedSuccess'), this.translate.instant('common.ok'), { duration: 2500 });
      },
      error: () => {
        this.deletingSavedId = null;
        this.snackBar.open(this.translate.instant('routePlanner.deleteError'), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  // ========================================================================
  // FORMATTING HELPERS
  // ========================================================================

  formatDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  routeLabel(index: number): string {
    if (index === 0) return this.translate.instant('routePlanner.recommended');
    return `${this.translate.instant('routePlanner.alternative')} ${index}`;
  }

  trafficLevelText(level: string): string {
    switch (level) {
      case 'heavy': return this.translate.instant('routePlanner.trafficHeavy');
      case 'moderate': return this.translate.instant('routePlanner.trafficModerate');
      default: return this.translate.instant('routePlanner.trafficLow');
    }
  }

  trafficLevelColor(level: string): string {
    switch (level) {
      case 'heavy': return '#D84E55';
      case 'moderate': return '#F59E0B';
      default: return '#2E9E56';
    }
  }

  // ========================================================================
  // GOOGLE MAPS STYLES (dark/light)
  // ========================================================================

  private readonly darkMapStyle: any[] = [
    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] }
  ];

  private readonly lightMapStyle: any[] = [];
}
