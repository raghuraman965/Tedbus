import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { url } from '../../config';

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  bio?: string;
  location?: string;
  authProvider?: string;
  profilePicture?: string;
  googleId?: string;
  token?: string;
  isAdmin?: boolean;
  preferredLanguage?: string;
  themePreference?: string;
}

// The rest of the app (navbar, profile page, payment page) already trusts
// this exact sessionStorage key + shape for the logged-in user, so every
// login method below writes to it in the same way, keeping everything
// (My Trips, booking, account menu) working regardless of how someone logs in.
const SESSION_KEY = 'Loggedinuser';
const REMEMBER_KEY = 'tedbus_remember_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = url + 'auth/';
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(this.bootstrapSession());
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) { }

  /** On app start, sessionStorage is empty on a fresh tab. If the user previously
   *  checked "Remember Me", hydrate sessionStorage from localStorage so every
   *  existing page that reads sessionStorage keeps working without changes.
   *
   *  Only sessions carrying a JWT `token` are considered logged in. Older
   *  sessions that predate token support (or any entry missing the token) are
   *  discarded so protected API calls never fire without an Authorization
   *  header (which would surface as 401s in Community, likes, booking, etc.). */
  private bootstrapSession(): AuthUser | null {
    const usable = (user: AuthUser | null): user is AuthUser =>
      !!user && !!user._id && !!user.token;

    const sessionRaw = sessionStorage.getItem(SESSION_KEY);
    if (sessionRaw) {
      const user = JSON.parse(sessionRaw) as AuthUser | null;
      if (usable(user)) {
        return user;
      }
      sessionStorage.removeItem(SESSION_KEY);
    }

    const rememberedRaw = localStorage.getItem(REMEMBER_KEY);
    if (rememberedRaw) {
      const user = JSON.parse(rememberedRaw) as AuthUser | null;
      if (usable(user)) {
        sessionStorage.setItem(SESSION_KEY, rememberedRaw);
        return user;
      }
      localStorage.removeItem(REMEMBER_KEY);
    }
    return null;
  }

  private persistSession(user: AuthUser, rememberMe: boolean = false): void {
    const json = JSON.stringify(user);
    sessionStorage.setItem(SESSION_KEY, json);
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, json);
    }
    this.currentUserSubject.next(user);
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  /** JWT returned by the backend on login/signup/OTP/Google auth. Used by the
   *  community API layer to authenticate protected requests. */
  get token(): string | null {
    return this.currentUserSubject.value?.token || null;
  }

  signup(data: { name: string; email: string; phone: string; password: string }): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.apiUrl + 'signup', data).pipe(
      tap(user => this.persistSession(user, false))
    );
  }

  login(data: { email: string; password: string }, rememberMe: boolean = false): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.apiUrl + 'login', data).pipe(
      tap(user => this.persistSession(user, rememberMe))
    );
  }

  sendOtp(phone: string): Observable<{ message: string; otp: string }> {
    return this.http.post<{ message: string; otp: string }>(this.apiUrl + 'send-otp', { phone });
  }

  verifyOtp(phone: string, otp: string, rememberMe: boolean = false): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.apiUrl + 'verify-otp', { phone, otp }).pipe(
      tap(user => this.persistSession(user, rememberMe))
    );
  }

  sendSignupOtp(phone: string): Observable<{ message: string; otp: string }> {
    return this.http.post<{ message: string; otp: string }>(this.apiUrl + 'signup-send-otp', { phone });
  }

  verifySignupOtp(phone: string, otp: string, name: string = '', rememberMe: boolean = false): Observable<AuthUser> {
    return this.http.post<AuthUser>(this.apiUrl + 'signup-verify-otp', { phone, otp, name }).pipe(
      tap(user => this.persistSession(user, rememberMe))
    );
  }

  /** Persists the already-authenticated Google user (payload comes from the existing
   *  CustomerService.addcustomermongo call, unchanged from the original Google flow). */
  persistGoogleUser(user: AuthUser, rememberMe: boolean = true): void {
    this.persistSession(user, rememberMe);
  }

  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    this.currentUserSubject.next(null);
  }

  /** Updates the cached session user (e.g. when the language preference is
   *  synced to MongoDB) so every consumer reading sessionStorage stays in sync. */
  updateUser(user: AuthUser): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (localStorage.getItem(REMEMBER_KEY)) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(user));
    }
    this.currentUserSubject.next(user);
  }

  // ── Email OTP Flow ──

  sendEmailOtp(email: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(this.apiUrl + 'send-email-otp', { email });
  }

  verifyEmailOtp(email: string, otp: string): Observable<{ customer: any; token: string }> {
    return this.http.post<{ customer: any; token: string }>(this.apiUrl + 'verify-email-otp', { email, otp });
  }

  googleLogin(credential: string): Observable<{ customer: any; token: string }> {
    return this.http.post<{ customer: any; token: string }>(this.apiUrl + 'google-login', { credential });
  }
}
