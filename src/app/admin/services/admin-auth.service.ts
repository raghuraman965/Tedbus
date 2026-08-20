import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { url } from '../../config';

export interface AdminProfile {
  _id: string;
  username: string;
  name?: string;
  role?: string;
}

const ADMIN_TOKEN_KEY = 'tedbus_admin_token';
const ADMIN_PROFILE_KEY = 'tedbus_admin_profile';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private authState = new BehaviorSubject<boolean>(this.hasToken());
  auth$ = this.authState.asObservable();

  constructor(private http: HttpClient) {}

  private hasToken(): boolean {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return this.hasToken();
  }

  get token(): string | null {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  get profile(): AdminProfile | null {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminProfile;
    } catch {
      return null;
    }
  }

  login(username: string, password: string): Observable<AdminProfile> {
    return this.http
      .post<{ token: string; admin: AdminProfile }>(url + 'admin/auth/login', {
        username,
        password,
      })
      .pipe(
        map((res) => {
          localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
          localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(res.admin));
          this.authState.next(true);
          return res.admin;
        })
      );
  }

  logout(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
    this.authState.next(false);
  }
}
