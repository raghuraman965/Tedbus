import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../config';

export interface PaymentSettings {
  _id?: string;
  merchantName: string;
  upiId: string;
  qrImage: string;
  accountName: string;
  isActive: boolean;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentSettingsService {
  private api: string = url + 'payment/settings';

  constructor(private http: HttpClient) {}

  getSettings(): Observable<PaymentSettings> {
    return this.http.get<PaymentSettings>(this.api);
  }

  updateSettings(settings: PaymentSettings): Observable<PaymentSettings> {
    return this.http.put<PaymentSettings>(this.api, settings);
  }
}
