import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BusService } from '../../../service/bus.service';
import { SeatLiveService } from '../../../service/seat-live.service';
import { Bus } from '../../../model/bus.model';
import { Route } from '../../../model/routes.model';

@Component({
  selector: 'app-right',
  templateUrl: './right.component.html',
  styleUrl: './right.component.css'
})
export class RightComponent implements OnInit, OnDestroy{
 matchedbus:Bus[]=[]
 routes:Route[]=[]
 seats:{[key:string]:any}={}
 loading:boolean=true
 errorMessage:string=''


 departurevar:string=''
 arrival:string=''
 date:string=''

 private bookedSub: Subscription | null = null;
 private releasedSub: Subscription | null = null;
 private seatsReady = false;
 private pollTimer: any = null;

 constructor(
   private route:ActivatedRoute,
   private busservice:BusService,
   private translate:TranslateService,
   private seatlive:SeatLiveService
 ){}

 getkeys(){
  return Object.keys(this.seats)
 }

 getRouteId(): string {
  const r: any = this.routes;
  if (!r) return '';
  if (Array.isArray(r)) return r[0]?._id || '';
  return r._id || '';
 }

 /** Reuses existing bus-card DOM across seat-data updates so scroll,
  *  open seat drawers, images and per-card timers survive the poll. */
 trackByBusId(_index: number, bus: Bus): string {
   return bus._id as string;
 }
 trackByKey(_index: number, key: string): string {
   return key;
 }
 ngOnInit(): void {
   this.route.queryParams.subscribe(params=>{
    const departure=params['departure'];
    const arrival=params['arrival'];
    const date=params['date'];
    this.departurevar=departure
    this.arrival=arrival
    this.date=date
   });
   this.busservice.GETBUSDETAILS(this.departurevar,this.arrival,this.date).subscribe({
    next:(response:any)=>{
     this.matchedbus=response.matchedBuses;
     this.routes=response.route;
     this.seats=response.busidwithseatobj;
     this.loading=false;
     this.afterSeatsLoaded();
    },
    error:(error)=>{
      console.error('Error fetching buses', error);
      this.errorMessage=this.translate.instant('search.loadError');
      this.loading=false;
    }
   });

 }

 ngOnDestroy(): void {
   this.bookedSub?.unsubscribe();
   this.releasedSub?.unsubscribe();
   this.stopPolling();
   (this.matchedbus || []).forEach((bus) => {
     if (bus._id && this.date) {
       this.seatlive.leaveBus(bus._id, this.date);
     }
   });
 }

 /** Wires real-time seat events + starts a light reconciliation poll. */
 private afterSeatsLoaded(): void {
   if (this.seatsReady) return;
   this.seatsReady = true;

   this.bookedSub = this.seatlive.onSeatsBooked().subscribe(({ busId, date, seats }) => {
     if (date !== this.date) return;
     this.mergeSeatsBooked(busId, seats);
   });

   this.releasedSub = this.seatlive.onSeatsReleased().subscribe(({ busId, date, seats }) => {
     if (date !== this.date) return;
     this.mergeSeatsReleased(busId, seats);
   });

   (this.matchedbus || []).forEach((bus) => {
     if (bus._id && this.date) {
       this.seatlive.joinBus(bus._id, this.date);
     }
   });

   this.startPolling();
 }

  /** Marks seats as SOLD by pushing them into the shared seat array for a bus. */
  private mergeSeatsBooked(busId: string, seats: number[]): void {
    const current: number[] = Array.isArray(this.seats[busId]) ? (this.seats[busId] as number[]) : [];
    const merged = new Set<number>(current);
    (Array.isArray(seats) ? seats : []).forEach((s) => merged.add(Number(s)));
    this.seats = { ...this.seats, [busId]: Array.from(merged).sort((a, b) => a - b) };
  }

  /** A pre-payment conflict was detected inside the seat map/drawer — reflect
   *  the taken seats in the shared bus card immediately (no wait for poll). */
  onSeatsTaken(busId: string, seats: number[]): void {
    this.mergeSeatsBooked(busId, seats);
  }

 /** Marks seats as available again (cancellation) by removing them. */
 private mergeSeatsReleased(busId: string, seats: number[]): void {
   const current: number[] = Array.isArray(this.seats[busId]) ? (this.seats[busId] as number[]) : [];
   const removed = new Set<number>((Array.isArray(seats) ? seats : []).map(Number));
   const remaining = current.filter((s) => !removed.has(s));
   this.seats = { ...this.seats, [busId]: remaining };
 }

  /** Socket is primary; this lightweight poll only syncs booked-seat data
   *  and never re-creates the page (no reload, no re-navigation, no DOM
   *  churn — see the setSoldSeats guard + trackBy in the template). */
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
   const busIds = Object.keys(this.seats);
   busIds.forEach((busId) => {
     this.busservice.validateSeats({ busId, date: this.date, seats: [] }).subscribe({
       next: (res: any) => {
         if (res && Array.isArray(res.soldSeats)) {
           this.setSoldSeats(busId, res.soldSeats);
         }
       },
       error: () => {}
     });
   });
 }

 /** Replaces the sold list with the authoritative snapshot, skipping no-op. */
 private setSoldSeats(busId: string, soldSeats: number[]): void {
   const arr: number[] = (Array.isArray(soldSeats) ? soldSeats : [])
     .map(Number)
     .sort((a, b) => a - b);
   const current: number[] = (this.seats[busId] as number[] || [])
     .map(Number)
     .sort((a, b) => a - b);
   if (
     arr.length === current.length &&
     arr.every((v, i) => v === current[i])
   ) {
     return;
   }
   this.seats = { ...this.seats, [busId]: arr };
 }
}
