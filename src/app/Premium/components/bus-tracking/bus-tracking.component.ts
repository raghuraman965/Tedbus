import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { TrackingService, TrackingData } from '../../../service/tracking.service';

@Component({
  selector: 'app-bus-tracking',
  templateUrl: './bus-tracking.component.html',
  styleUrls: ['./bus-tracking.component.css']
})
export class BusTrackingComponent implements OnInit, OnDestroy {
  busId = '';
  date = '';
  loading = true;
  error = '';
  tracking: TrackingData | null = null;
  refreshTimer: any;

  constructor(
    private route: ActivatedRoute,
    private translate: TranslateService,
    private trackingService: TrackingService
  ) {}

  ngOnInit(): void {
    this.busId = this.route.snapshot.params['busId'] || '';
    this.date = this.route.snapshot.params['date'] || '';
    this.loadTracking();
    this.refreshTimer = setInterval(() => this.loadTracking(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  loadTracking(): void {
    if (!this.busId || !this.date) return;
    this.trackingService.getTracking(this.busId, this.date).subscribe({
      next: (data) => {
        this.tracking = data;
        this.loading = false;
        this.error = '';
      },
      error: () => {
        this.loading = false;
        this.error = 'tracking.error';
      }
    });
  }

  get statusText(): string {
    if (!this.tracking) return '';
    switch (this.tracking.journey.status) {
      case 'not_started': return 'tracking.notStarted';
      case 'in_progress': return 'tracking.inProgress';
      case 'completed': return 'tracking.completed';
      default: return '';
    }
  }

  get statusIcon(): string {
    if (!this.tracking) return 'directions_bus';
    switch (this.tracking.journey.status) {
      case 'not_started': return 'schedule';
      case 'in_progress': return 'directions_bus';
      case 'completed': return 'check_circle';
      default: return 'directions_bus';
    }
  }

  get etaFormatted(): string {
    if (!this.tracking) return '';
    const mins = this.tracking.journey.etaMinutes;
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  get delayText(): string {
    if (!this.tracking) return '';
    const d = this.tracking.journey.delayMinutes;
    if (d === 0) return 'tracking.onTime';
    return d > 0 ? `tracking.delayed` : `tracking.ahead`;
  }

  get delayValue(): number {
    return this.tracking ? Math.abs(this.tracking.journey.delayMinutes) : 0;
  }

  get delayClass(): string {
    const d = this.tracking?.journey.delayMinutes || 0;
    if (d > 0) return 'delay-late';
    if (d < 0) return 'delay-early';
    return 'delay-on-time';
  }

  formatDepartureTime(): string {
    if (!this.tracking) return '';
    return this.tracking.journey.departureTime || '';
  }

  formatArrivalTime(): string {
    if (!this.tracking) return '';
    return this.tracking.journey.arrivalTime || '';
  }
}
