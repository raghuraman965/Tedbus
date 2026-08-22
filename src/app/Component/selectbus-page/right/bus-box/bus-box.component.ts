import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { parseTimeToMinutes, addMinutesToDeparture, formatClockTime, formatDuration, getJourneyDateLabel, getArrivalDateLabel } from '../../../../utils/time-utils';

@Component({
  selector: 'app-bus-box',
  templateUrl: './bus-box.component.html',
  styleUrl: './bus-box.component.css'
})
export class BusBoxComponent implements OnChanges, OnInit {
@Input() rating:number[]=[];
@Input() reviewStats:{avgRating:number,totalReviews:number}|undefined
@Input() operatorname:string=''
@Input() bustype:string=''
@Input() departuretime:string=""
@Input() reschedulable :number=0
@Input() livetracking: number=0
@Input() filledseats:any[]=[]
@Input() routedetails: any
@Input() busid:string=''
@Input() date:string=''
@Input() routeId:string=''
@Output() seatsTaken = new EventEmitter<number[]>();
avgrating:number=0
totalreview:number=0
seatprivce:number=0
bustypename:string=''
busdeparturetime:string='';
busarrivaltime:string='';
departureDayLabel:string=''
arrivalDayLabel:string=''
dayOffset:number=0
operatorInitial:string=''
totalSeats:number=40
showRouteTimeline:boolean=false
constructor(private translate: TranslateService){}
ngOnInit(): void{
  this.operatorInitial=(this.operatorname || 'B').trim().charAt(0).toUpperCase();
  this.totalSeats=40;
  this.applyRating();
  this.seatprivce = this.computeFare();
  if(this.bustype ==='standard'){
    this.bustypename='search.types.standard';
  }else if(this.bustype ==='sleeper'){
    this.bustypename='search.types.sleeper';
  }else if (this.bustype ==='A/C Seater'){
    this.bustypename='search.types.acSeater';
  }else{
    this.bustypename='search.types.nonAc';
  }

  const depMinutes = parseTimeToMinutes(this.departuretime);
  const durationMinutes = Math.round((this.routedetails?.duration || 0) * 60);
  const arrMinutes = addMinutesToDeparture(depMinutes, durationMinutes);
  this.dayOffset = Math.floor((depMinutes + durationMinutes) / (24 * 60));
  this.busdeparturetime = formatClockTime(depMinutes);
  this.busarrivaltime = formatClockTime(arrMinutes);
  this.departureDayLabel = this.translateDayLabel(getJourneyDateLabel(this.date));
  this.arrivalDayLabel = this.translateDayLabel(getArrivalDateLabel(this.date, this.dayOffset));
}

/** Real review stats from the backend win over the static seeded array. */
ngOnChanges(): void {
  this.applyRating();
}

private applyRating(): void {
  if (this.reviewStats && (this.reviewStats.totalReviews > 0 || !this.rating?.length)) {
    this.avgrating = this.reviewStats.avgRating || 0;
    this.totalreview = this.reviewStats.totalReviews || 0;
  } else {
    let sum = 0;
    let count = 0;
    (this.rating || []).forEach((item) => {
      sum += item;
      count += 1;
    });
    this.avgrating = count ? +(sum / count).toFixed(1) : 0;
    this.totalreview = count;
  }
}

private translateDayLabel(label: string): string {
  if (label === 'Today') return this.translate.instant('search.today');
  if (label === 'Tomorrow') return this.translate.instant('search.tomorrow');
  return label;
}

formatStopTime(value: string | number | null | undefined): string {
  return formatClockTime(value);
}

computeFare(): number {
  const fareConfig = (this.routedetails as any)?.fareConfig;
  const totalDistance = (this.routedetails as any)?.totalDistanceKm || 0;
  if (fareConfig && totalDistance > 0) {
    let base = Math.max(fareConfig.baseFare || 0, totalDistance * (fareConfig.pricePerKm || 1.5));
    base = Math.max(base, fareConfig.minimumFare || 50);
    const multiplier = fareConfig.busTypeMultipliers?.[this.bustype] || 1.0;
    return Math.round(base * multiplier);
  }
  const duration = this.routedetails?.duration || 0;
  if (this.bustype === 'standard') return Math.round(50 * Math.floor(duration) / 2);
  if (this.bustype === 'sleeper') return Math.round(100 * Math.floor(duration) / 2);
  if (this.bustype === 'A/C Seater') return Math.round(125 * Math.floor(duration) / 2);
  return Math.round(75 * Math.floor(duration) / 2);
}

getDepartureMinutes(): number {
  return parseTimeToMinutes(this.departuretime);
}

getArrivalMinutes(): number {
  const depMinutes = parseTimeToMinutes(this.departuretime);
  const durationMinutes = Math.round((this.routedetails?.duration || 0) * 60);
  return addMinutesToDeparture(depMinutes, durationMinutes);
}

formatDurationFunc(decimalHours: number): string {
  return formatDuration(decimalHours);
}

toggleRouteTimeline(): void {
  this.showRouteTimeline = !this.showRouteTimeline;
}
seatFillPercent(): number {
  const filled = this.filledseats?.length || 0;
  return Math.min(Math.max((filled / this.totalSeats) * 100, 4), 100);
}
}
