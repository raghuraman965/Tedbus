import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { url } from '../config';

export interface SeatLiveEvent {
  busId: string;
  date: string;
  seats: number[];
}

/**
 * Real-time seat-sync bridge. Keeps one Socket.IO connection to the backend,
 * joins a room per (busId, date) and re-broadcasts `seatsBooked`/`seatsReleased`
 * events to any component that subscribed. Events are dispatched inside the
 * Angular zone so change detection fires without extra bookkeeping.
 */
@Injectable({ providedIn: 'root' })
export class SeatLiveService {
  private socket: Socket | null = null;
  private joined: { busId: string; date: string }[] = [];

  private booked$ = new Subject<SeatLiveEvent>();
  private released$ = new Subject<SeatLiveEvent>();

  constructor(private ngZone: NgZone) {}

  private ensureConnected(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    if (this.socket) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(url, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => {
      // Re-join any rooms this page asked for before the connection was up.
      this.joined.forEach((room) => this.socket?.emit('bus:join', room));
    });

    this.socket.on('seatsBooked', (event: SeatLiveEvent) => {
      this.ngZone.run(() => this.booked$.next(event));
    });

    this.socket.on('seatsReleased', (event: SeatLiveEvent) => {
      this.ngZone.run(() => this.released$.next(event));
    });

    return this.socket;
  }

  joinBus(busId: string, date: string): void {
    const room = { busId: String(busId), date: String(date) };
    this.joined = this.joined.filter(
      (r) => !(r.busId === room.busId && r.date === room.date)
    );
    this.joined.push(room);
    this.ensureConnected();
    if (this.socket?.connected) {
      this.socket.emit('bus:join', room);
    }
  }

  leaveBus(busId: string, date: string): void {
    const room = { busId: String(busId), date: String(date) };
    this.joined = this.joined.filter(
      (r) => !(r.busId === room.busId && r.date === room.date)
    );
    if (this.socket?.connected) {
      this.socket.emit('bus:leave', room);
    }
  }

  onSeatsBooked(): Observable<SeatLiveEvent> {
    this.ensureConnected();
    return this.booked$.asObservable();
  }

  onSeatsReleased(): Observable<SeatLiveEvent> {
    this.ensureConnected();
    return this.released$.asObservable();
  }
}
