import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../../config';
import { AdminAuthService } from './admin-auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private base = url + 'admin/';

  constructor(private http: HttpClient, private auth: AdminAuthService) {}

  private headers(): { Authorization?: string } {
    const token = this.auth.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  get<T>(path: string, params?: Record<string, any>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          httpParams = httpParams.set(k, String(v));
        }
      });
    }
    return this.http.get<T>(this.base + path, {
      headers: this.headers(),
      params: httpParams,
    });
  }

  post<T>(path: string, body?: any): Observable<T> {
    return this.http.post<T>(this.base + path, body, { headers: this.headers() });
  }

  put<T>(path: string, body?: any): Observable<T> {
    return this.http.put<T>(this.base + path, body, { headers: this.headers() });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.base + path, { headers: this.headers() });
  }
}
