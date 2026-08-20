import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge, timer, EMPTY } from 'rxjs';
import { map, filter, distinctUntilChanged, switchMap, take, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly online$ = new BehaviorSubject<boolean>(navigator.onLine);
  private readonly slowNetwork$ = new BehaviorSubject<boolean>(false);
  private readonly backOnline$ = new Observable<void>((subscriber) => {
    let wasOffline = !navigator.onLine;
    const sub = this.online$.pipe(distinctUntilChanged()).subscribe((online) => {
      if (wasOffline && online) {
        subscriber.next();
      }
      wasOffline = !online;
    });
    return () => sub.unsubscribe();
  });

  private requestStartTimes = new Map<string, number>();
  private readonly SLOW_THRESHOLD_MS = 5000;

  constructor() {
    fromEvent(window, 'online').subscribe(() => this.online$.next(true));
    fromEvent(window, 'offline').subscribe(() => {
      this.online$.next(false);
      this.slowNetwork$.next(false);
    });
  }

  get isOnline(): boolean {
    return this.online$.getValue();
  }

  get isSlowNetwork(): boolean {
    return this.slowNetwork$.getValue();
  }

  get onlineStatus$(): Observable<boolean> {
    return this.online$.asObservable().pipe(distinctUntilChanged());
  }

  get slowNetworkStatus$(): Observable<boolean> {
    return this.slowNetwork$.asObservable().pipe(distinctUntilChanged());
  }

  get backOnlineNotification$(): Observable<void> {
    return this.backOnline$;
  }

  markRequestStart(id: string = 'default'): void {
    this.requestStartTimes.set(id, performance.now());
  }

  checkSlowNetwork(id: string = 'default'): number {
    const start = this.requestStartTimes.get(id);
    if (start === undefined) return -1;

    this.requestStartTimes.delete(id);
    const elapsed = performance.now() - start;
    this.slowNetwork$.next(elapsed > this.SLOW_THRESHOLD_MS);
    return elapsed;
  }

  async ping(): Promise<number> {
    const start = performance.now();
    try {
      await fetch('/assets/i18n/en.json', { cache: 'no-store' });
      const elapsed = performance.now() - start;
      this.slowNetwork$.next(elapsed > this.SLOW_THRESHOLD_MS);
      return elapsed;
    } catch {
      this.online$.next(false);
      return -1;
    }
  }
}
