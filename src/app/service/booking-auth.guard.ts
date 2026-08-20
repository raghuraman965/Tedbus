import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../Premium/services/auth.service';

/** sessionStorage key holding the URL the user was trying to reach so the
 *  booking (bus, route, date, passenger count, selected seats — all carried in
 *  the URL of /payment) can be resumed after a successful login. */
export const LOGIN_REDIRECT_KEY = 'tedbus_login_redirect';

/** localStorage backup key — survives page reloads that clear sessionStorage. */
export const LOGIN_REDIRECT_LS_KEY = 'tedbus_login_redirect_ls';

/** i18n key shown on the /login page explaining why login is required. */
export const LOGIN_MESSAGE_KEY = 'auth.loginToContinue';

/**
 * Blocks guests from entering any page that commits money or shows private
 * booking data (payment, booking confirmation, ticket, profile). A guest is
 * redirected to /login with the intended URL + message so they can log in and
 * resume the exact booking without starting over. This is the frontend layer of
 * the defence — the matching backend endpoints also reject unauthenticated
 * requests (401), so a direct API call or crafted URL can never bypass login.
 */
@Injectable({ providedIn: 'root' })
export class BookingAuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
    if (this.authService.isLoggedIn) {
      return true;
    }

    // Remember exactly where the guest was going (query params included) so the
    // booking context survives the login detour. Persist to both sessionStorage
    // (fast, tab-scoped) and localStorage (survives reload) so the login page
    // always has a fallback if the query-param string is lost.
    sessionStorage.setItem(LOGIN_REDIRECT_KEY, state.url);
    try { localStorage.setItem(LOGIN_REDIRECT_LS_KEY, state.url); } catch {}

    return this.router.createUrlTree(['/login'], {
      queryParams: {
        redirect: state.url,
        message: LOGIN_MESSAGE_KEY,
      },
    });
  }
}
