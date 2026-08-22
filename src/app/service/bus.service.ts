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

  // ===== Lock-on-proceed flow =====

  /** Places a 10-minute hold on the selected seats and returns the
   *  server-computed fare quote + holdId/expiresAt. */
  lockSeats(payload: {
    routeId: string; busId: string; date: string; seats: number[];
    boardingStopSequence: number; droppingStopSequence: number;
  }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'seats/lock', payload, { headers: this.authHeaders() });
  }

  /** Explicitly gives up a seat hold when the user backs out. */
  releaseSeats(busId: string, date: string, holdId: string): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'seats/release', { busId, date, holdId }, { headers: this.authHeaders() });
  }

  /** THE booking creation endpoint. Requires paymentReference + holdId — both
   *  are validated server-side; nothing here is trusted from the client. */
  createBooking(payload: {
    paymentReference: string;
    holdId: string;
    passengerDetails: Array<{ name: string; age: number; gender?: string }>;
    phoneNumber?: string;
    isBusinessTravel?: boolean;
    businessDetails?: { gstNumber?: string; companyName?: string };
    isInsurance?: boolean;
    isCovidDonated?: boolean;
  }): Observable<Booking> {
    return this.http.post<Booking>(this.busbookapi, payload, { headers: this.authHeaders() });
  }

  /** What would this cancellation refund? (policy-computed, live) */
  refundQuote(bookingId: string): Observable<any> {
    return this.http.get<any>(this.busbookapi + `refund-quote/${bookingId}`, { headers: this.authHeaders() });
  }

  // ===== Legacy endpoints (backward compat) =====

  GETBUSDETAILS(depart: string, arrival: string, date: string): Observable<any> {
    const apiUrl = `${this.apiurl}${depart}/${arrival}/${date}`;
    return this.http.get<any>(apiUrl);
  }

  GETAVAILABLEROUTES(): Observable<{ routes: any[] }> {
    return this.http.get<{ routes: any[] }>(`${this.apiurl}available`);
  }

  getbusmongo(id: string): Observable<Booking[]> {
    const apiUrl = `${this.busbookapi}${id}`;
    return this.http.get<Booking[]>(apiUrl, { headers: this.authHeaders() });
  }

  /** Asks the server to price the booking (authoritative) and open a Razorpay
   *  order for exactly that amount. The response carries everything Checkout
   *  needs plus the paymentReference used to consume the payment later. */
  createPaymentOrder(payload: {
    routeId: string; busId: string; date: string; seats: number[];
    holdId: string;
    boardingStopSequence?: number; droppingStopSequence?: number; seatType?: string;
  }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'payment/order', payload, { headers: this.authHeaders() });
  }

  /** Verifies the Razorpay signature server-side. Only a success here marks
   *  the payment attempt verified so the booking can be created. */
  confirmPayment(payload: {
    paymentReference: string; razorpay_order_id: string;
    razorpay_payment_id: string; razorpay_signature: string;
  }): Observable<any> {
    return this.http.post<any>(this.busbookapi + 'payment/confirm', payload, { headers: this.authHeaders() });
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
