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

    if (req.url.startsWith(url) && token && !req.headers.has('Authorization')) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(req).pipe(
      catchError(error => {
        if (error.status === 401 && !req.url.includes('/admin/')) {
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
