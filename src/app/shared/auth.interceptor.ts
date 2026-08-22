import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from '../Premium/services/auth.service';
import { url } from '../config';
import { LOGIN_REDIRECT_KEY, LOGIN_REDIRECT_LS_KEY } from '../service/booking-auth.guard';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService, private router: Router) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const token = this.authService.token;

    let didAttachToken = false;
    if (req.url.startsWith(url) && token && !req.headers.has('Authorization')) {
      didAttachToken = true;
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(req).pipe(
      catchError(error => {
        // A 401 is only treated as "session expired" when ALL of these hold:
        //  - it came from an app API (never admin panel auth),
        //  - it is NOT a login/OTP/Google auth attempt (those legitimately
        //    return 401 for bad credentials and must not nuke the session),
        //  - we actually sent a token (so the server rejected a real session,
        //    not an anonymous request to a protected endpoint), and
        //  - we are not already on the login page (avoids redirect loops).
        const isAuthEndpoint = req.url.includes('/auth/');
        const isAdmin = req.url.includes('/admin/');
        const alreadyOnLogin = this.router.url.startsWith('/login');

        if (
          error.status === 401 &&
          !isAdmin &&
          !isAuthEndpoint &&
          didAttachToken &&
          !alreadyOnLogin
        ) {
          this.authService.logout();
          // Preserve the current URL so the user can resume their booking
          // after re-authenticating.
          const currentUrl = this.router.url;
          try { sessionStorage.setItem(LOGIN_REDIRECT_KEY, currentUrl); } catch {}
          try { localStorage.setItem(LOGIN_REDIRECT_LS_KEY, currentUrl); } catch {}
          this.router.navigate(['/login'], {
            queryParams: {
              redirect: currentUrl,
              message: 'auth.loginToContinue'
            }
          });
        }
        return throwError(() => error);
      })
    );
  }
}
