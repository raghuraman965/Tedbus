import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ReviewService, Review as ApiReview, ReviewStats, ReviewListResponse } from '../../../../../service/review.service';
import { parseTimeToMinutes, formatClockTime, formatDuration } from '../../../../../utils/time-utils';

export interface Amenity {
  icon: string;
  name: string;
  subtitle: string;
  included: boolean;
}

export interface Review {
  name: string;
  initials: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
  travellerType: string;
}

export interface BoardingPoint {
  name: string;
  time: string;
  address: string;
  landmark: string;
}

export interface PolicySection {
  icon: string;
  title: string;
  description: string;
  points: string[];
}

@Component({
  selector: 'app-bottom-tab',
  templateUrl: './bottom-tab.component.html',
  styleUrls: ['./bottom-tab.component.css']
})
export class BottomTabComponent implements OnInit {
@Input() filledseats:number[]=[]
@Input() seatprice:number=0;
@Input() routedetials:any;
@Input() busarrivaltime: number=0;
@Input() busdeparturetime:number=0;
@Input() operatorname: string=''
@Input() busid:string=''
@Input() date:string=''
@Input() searchResult: any = null;
@Input() segmentDistance: number = 0;
@Input() routeId: string = '';
@Output() seatsTaken = new EventEmitter<number[]>();

constructor(private translate: TranslateService, private reviewService: ReviewService) {}

ngOnInit(): void {
  if (this.busid) {
    this.loadReviews();
  }
}

private loadReviews(): void {
  this.reviewService.getReviews(this.busid, 1, 50).subscribe({
    next: (res: ReviewListResponse) => {
      if (res.stats) {
        this.overallRating = res.stats.avgRating || 0;
        this.totalReviews = res.stats.totalReviews || 0;
        const total = this.totalReviews || 1;
        this.ratingBreakdown = [5, 4, 3, 2, 1].map(stars => ({
          stars,
          percent: Math.round(((res.stats.ratingBreakdown[stars] || 0) / total) * 100)
        }));
      }
      const list = res.reviews || [];
      // Real derived stats — no fabricated values.
      this.verifiedReviews = list.filter((r: any) => r.author?.isVerified).length;
      this.recommendPercent = list.length
        ? Math.round((list.filter((r: any) => r.rating >= 4).length / list.length) * 100)
        : 0;
      this.reviews = list.map((r: any) => ({
        name: r.author?.name || r.customerName || 'Anonymous',
        initials: (r.author?.name || r.customerName || 'A').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
        rating: r.rating,
        date: r.createdAt ? new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '',
        title: r.title || '',
        comment: r.comment || '',
        verified: !!r.author?.isVerified,
        travellerType: ''
      }));
    },
    error: () => {}
  });
}

tabstate:boolean[]=[false,false,false,false,false]

handletabstate(value:number):void{
  for(let i=0;i<this.tabstate.length;i++){
    this.tabstate[i]=(i===value && !this.tabstate[i])
  }
}

amenities: Amenity[] = [
  { icon: 'wifi', name: 'classic.amenities.wifi', subtitle: 'classic.amenitySub.wifi', included: true },
  { icon: 'power', name: 'classic.amenities.chargingPoint', subtitle: 'classic.amenitySub.chargingPoint', included: true },
  { icon: 'bedtime', name: 'classic.amenities.blankets', subtitle: 'classic.amenitySub.blankets', included: true },
  { icon: 'water_drop', name: 'classic.amenities.waterBottle', subtitle: 'classic.amenitySub.waterBottle', included: true },
  { icon: 'light_mode', name: 'classic.amenities.readingLight', subtitle: 'classic.amenitySub.readingLight', included: true },
  { icon: 'emergency', name: 'classic.amenities.emergencyExit', subtitle: 'classic.amenitySub.emergencyExit', included: true },
  { icon: 'gps_fixed', name: 'classic.amenities.gpsTracking', subtitle: 'classic.amenitySub.gpsTracking', included: true },
  { icon: 'location_searching', name: 'classic.amenities.liveTracking', subtitle: 'classic.amenitySub.liveTracking', included: true }
];

ratingBreakdown: { stars: number; percent: number }[] = [
  { stars: 5, percent: 0 },
  { stars: 4, percent: 0 },
  { stars: 3, percent: 0 },
  { stars: 2, percent: 0 },
  { stars: 1, percent: 0 }
];

overallRating = 0;
totalReviews = 0;
verifiedReviews = 0;
recommendPercent = 0;

get roundedRating(): number {
  return Math.round(this.overallRating);
}

reviews: Review[] = [];

private getAmpmLabels(): { am: string; pm: string } {
  return {
    am: this.translate.instant('common.am') || 'AM',
    pm: this.translate.instant('common.pm') || 'PM'
  };
}

get boardingPoints(): BoardingPoint[] {
  const subs = this.routedetials?.departureLocation?.subLocations || [];
  const baseTime = this.busdeparturetime;
  const labels = this.getAmpmLabels();
  const points = subs.slice(0, 4).map((sub: string, index: number) => ({
    name: sub,
    time: formatClockTime((baseTime + index * 30) % (24 * 60), labels),
    address: this.translate.instant('classic.seats.busTerminal', { name: sub }),
    landmark: this.translate.instant('classic.oppSubMall', { name: sub })
  }));
  if (!points.length) {
    points.push({
      name: this.routedetials?.departureLocation?.name || this.translate.instant('booking.mainTerminal'),
      time: formatClockTime(baseTime, labels),
      address: this.translate.instant('classic.seats.busTerminal', { name: this.translate.instant('booking.mainTerminal') }),
      landmark: this.translate.instant('classic.oppCityMall')
    });
  }
  return points;
}

get droppingPoints(): BoardingPoint[] {
  const subs = this.routedetials?.arrivalLocation?.subLocations || [];
  const baseTime = this.busarrivaltime;
  const labels = this.getAmpmLabels();
  const points = subs.slice(0, 4).map((sub: string, index: number) => ({
    name: sub,
    time: formatClockTime((baseTime + index * 30) % (24 * 60), labels),
    address: this.translate.instant('classic.seats.centralBusStand', { name: sub }),
    landmark: this.translate.instant('classic.nearSubMetro', { name: sub })
  }));
  if (!points.length) {
    points.push({
      name: this.routedetials?.arrivalLocation?.name || this.translate.instant('booking.centralTerminal'),
      time: formatClockTime(baseTime, labels),
      address: this.translate.instant('classic.seats.centralBusStand', { name: this.translate.instant('booking.centralTerminal') }),
      landmark: this.translate.instant('classic.nearMetro')
    });
  }
  return points;
}

formatDurationFunc(decimalHours: number): string {
  return formatDuration(decimalHours);
}

policies: PolicySection[] = [
  {
    icon: 'event_available',
    title: 'classic.policy.cancellationTitle',
    description: 'classic.policy.cancellationDesc',
    points: [
      'classic.policy.cancellationPoints.0',
      'classic.policy.cancellationPoints.1',
      'classic.policy.cancellationPoints.2'
    ]
  },
  {
    icon: 'currency_rupee',
    title: 'classic.policy.refundTitle',
    description: 'classic.policy.refundDesc',
    points: [
      'classic.policy.refundPoints.0',
      'classic.policy.refundPoints.1',
      'classic.policy.refundPoints.2'
    ]
  },
  {
    icon: 'update',
    title: 'classic.policy.rescheduleTitle',
    description: 'classic.policy.rescheduleDesc',
    points: [
      'classic.policy.reschedulePoints.0',
      'classic.policy.reschedulePoints.1',
      'classic.policy.reschedulePoints.2'
    ]
  },
  {
    icon: 'badge',
    title: 'classic.policy.identityTitle',
    description: 'classic.policy.identityDesc',
    points: [
      'classic.policy.identityPoints.0',
      'classic.policy.identityPoints.1',
      'classic.policy.identityPoints.2'
    ]
  },
  {
    icon: 'luggage',
    title: 'classic.policy.luggageTitle',
    description: 'classic.policy.luggageDesc',
    points: [
      'classic.policy.luggagePoints.0',
      'classic.policy.luggagePoints.1',
      'classic.policy.luggagePoints.2'
    ]
  }
];
}
