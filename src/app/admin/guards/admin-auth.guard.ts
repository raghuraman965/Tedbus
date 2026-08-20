import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthGuard implements CanActivate {
  constructor(private auth: AdminAuthService, private router: Router) {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    if (this.auth.isAuthenticated) {
      return true;
    }
    this.router.navigate(['/admin/login'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }
}
