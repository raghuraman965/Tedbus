import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Bus, SearchResult } from '../model/bus.model';
import { url } from '../config';
import { Booking } from '../model/booking.model';

@Injectable({
  providedIn: 'root'
})
export class BusService {
  private busbookapi: string = url + 'booking/';
  private apiurl: string = url + 'routes/';
  private searchApi: string = url + 'search/';

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    let token = '';
    try {
      const raw = sessionStorage.getItem('Loggedinuser');
      if (raw) token = (JSON.parse(raw) as any)?.token || '';
    } catch (e) { token = ''; }
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  // ===== New segment-based search =====

  /** Advanced search with intermediate stops, time-awareness, segment availability */
  searchBuses(from: string, to: string, date: string, passengers: number = 1): Observable<SearchResult> {
    return this.http.get<SearchResult>(
      `${this.searchApi}${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}?passengers=${passengers}`
    );
  }

  /** Get route detail with all stops */
  getRouteDetail(routeId: string): Observable<any> {
    return this.http.get<any>(`${this.searchApi}route/${routeId}`);
  }

  /** Get boarding/dropping points for a segment */
  getBoardingDroppingPoints(routeId: string, fromSeq: number, toSeq: number): Observable<any> {
    return this.http.get<any>(`${this.searchApi}points/${routeId}/${fromSeq}/${toSeq}`);
  }

  /** Get segment-specific seat availability */
  getSegmentSeats(busId: string, date: string, fromSeq: number, toSeq: number, totalSeats: number): Observable<any> {
    return this.http.post<any>(`${this.searchApi}segment-seats`, {
      busId, date, fromSequence: fromSeq, toSequence: toSeq, totalSeats
    });
  }

  /** Calculate fare for a segment */
  calculateFare(payload: {
    routeId: string; busId: string; date: string;
    fromSequence: number; toSequence: number;
    seats?: string[]; seatType?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.busbookapi}calculate-fare`, payload);
  }

  /** Create a segment-aware booking */
  addSegmentBooking(booking: any): Observable<Booking> {
    return this.http.post<Booking>(`${this.busbookapi}segment`, booking, { headers: this.authHeaders() });
  }

  // ===== Legacy endpoints (backward compat) =====

  GETBUSDETAILS(depart: string, arrival: string, date: string): Observable<any> {
    const apiUrl = `${this.apiurl}${depart}/${arrival}/${date}`;
    return this.http.get<any>(apiUrl);
  }

  GETAVAILABLEROUTES(): Observable<{ routes: any[] }> {
    return this.http.get<{ routes: any[] }>(`${this.apiurl}available`);
  }

  addbusmongo(myBooking: any): Observable<Booking> {
    const busbook: Booking = {
      customerId: myBooking.customerId,
      passengerDetails: myBooking.passengerDetails,
      email: myBooking.email,
      phoneNumber: myBooking.phoneNumber,
      fare: myBooking.fare,
      status: myBooking.status,
      bookingDate: myBooking.bookingDate,
      busId: myBooking.busId,
      seats: myBooking.seats,
      departureDetails: myBooking.departureDetails,
      arrivalDetails: myBooking.arrivalDetails,
      duration: myBooking.duration,
      isBusinessTravel: myBooking.isBusinessTravel,
      isInsurance: myBooking.isInsurance,
      isCovidDonated: myBooking.isCovidDonated,
      paymentReference: myBooking.paymentReference,
      paymentMethod: myBooking.paymentMethod,
      transactionId: myBooking.transactionId
    };
    return this.http.post<Booking>(this.busbookapi, busbook, { headers: this.authHeaders() });
  }

  getbusmongo(id: string): Observable<Booking[]> {
    const apiUrl = `${this.busbookapi}${id}`;
    return this.http.get<Booking[]>(apiUrl, { headers: this.authHeaders() });
  }

  verifyPayment(payload: { paymentReference: string; customerId: string; amount: number; method: string; }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'verify-payment', payload, { headers: this.authHeaders() });
  }

  validateSeats(payload: { busId: string; date: string; seats: number[]; boardingSequence?: number; droppingSequence?: number }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'validate-seats', payload);
  }

  getBookingByPnr(pnr: string): Observable<Booking> {
    return this.http.get<Booking>(this.busbookapi + `ticket/${encodeURIComponent(pnr)}`, { headers: this.authHeaders() });
  }

  downloadTicketPdf(pnr: string, inline: boolean = false): Observable<Blob> {
    const q = inline ? '?inline=1' : '';
    return this.http.get(this.busbookapi + `ticket/${encodeURIComponent(pnr)}/pdf${q}`, {
      headers: this.authHeaders(),
      responseType: 'blob'
    });
  }

  emailTicket(pnr: string): Observable<any> {
    return this.http.post<any>(this.busbookapi + `ticket/${encodeURIComponent(pnr)}/email`, {}, { headers: this.authHeaders() });
  }

  verifyTicket(body: { qrData?: string; pnr?: string }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'verify-ticket', body);
  }

  cancelBooking(id: string): Observable<Booking> {
    return this.http.delete<Booking>(this.busbookapi + id, { headers: this.authHeaders() });
  }

  saveTicketPdfBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }
}
