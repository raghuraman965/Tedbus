import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { LoginModalComponent } from '../login-modal/login-modal.component';
import { LOGIN_REDIRECT_KEY } from '../../../service/booking-auth.guard';

@Component({
  selector: 'app-auth-landing',
  templateUrl: './auth-landing.component.html',
  styleUrls: ['./auth-landing.component.css']
})
export class AuthLandingComponent implements OnInit {
  /** i18n key (or plain text) of the message explaining why login is needed.
   *  Set when the BookingAuthGuard bounces a guest here from a protected page. */
  message: string = '';
  redirect: string = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.redirect = params['redirect'] || sessionStorage.getItem(LOGIN_REDIRECT_KEY) || '';
      this.message = params['message'] || '';
    });
  }

  /** Resolves the post-login destination: the exact page the guest was trying
   *  to reach (which carries the bus/route/date/seats), falling back to home. */
  private destination(): string {
    return this.redirect && this.redirect.startsWith('/') ? this.redirect : '/';
  }

  openLogin(): void {
    const ref = this.dialog.open(LoginModalComponent, {
      panelClass: 'premium-dialog-panel',
      autoFocus: false,
      data: { message: this.message ? this.message : '' }
    });

    ref.afterClosed().subscribe((success: boolean) => {
      if (success) {
        this.router.navigateByUrl(this.destination());
      }
    });
  }

  goToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
