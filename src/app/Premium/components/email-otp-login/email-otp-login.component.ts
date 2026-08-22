import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { LOGIN_REDIRECT_LS_KEY } from '../../../service/booking-auth.guard';

declare var google: any;

@Component({
  selector: 'app-email-otp-login',
  templateUrl: './email-otp-login.component.html',
  styleUrls: ['./email-otp-login.component.css']
})
export class EmailOtpLoginComponent implements OnInit, AfterViewInit, OnDestroy {
  mode: 'email' | 'otp' = 'email';

  email: string = '';
  otpDigits: string[] = ['', '', '', '', '', ''];
  otp: string = '';

  isSending: boolean = false;
  isVerifying: boolean = false;
  isGoogleLoading: boolean = false;

  errorMessage: string = '';

  countdown: number = 300;
  countdownDisplay: string = '05:00';
  countdownTimer: any = null;

  resendCooldown: number = 0;
  resendCooldownTimer: any = null;

  private redirect: string = '';
  private readonly GOOGLE_CLIENT_ID = '129421237209-jricn8ed4fgld4glk6k716deq5ebsmpb.apps.googleusercontent.com';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.redirect = params['redirect'] || '';
      // Fallback: the BookingAuthGuard also persists the URL to localStorage so
      // the redirect survives a page reload that might clear sessionStorage or
      // truncate the query string.
      if (!this.redirect) {
        try { this.redirect = localStorage.getItem(LOGIN_REDIRECT_LS_KEY) || ''; } catch {}
      }
    });
  }

  ngAfterViewInit(): void {
    this.initGoogleSignIn();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
    }
  }

  private initGoogleSignIn(): void {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: this.GOOGLE_CLIENT_ID,
        callback: (response: any) => this.handleGoogleCallback(response)
      });

      const googleBtnContainer = document.getElementById('email-otp-google-btn');
      if (googleBtnContainer) {
        google.accounts.id.renderButton(googleBtnContainer, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 300
        });
      }
    }
  }

  // â”€â”€ Email Validation â”€â”€

  isValidEmail(): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(this.email.trim());
  }

  // â”€â”€ Send Email OTP â”€â”€

  sendEmailOtp(): void {
    this.errorMessage = '';
    if (!this.email.trim()) {
      this.errorMessage = this.translate.instant('auth.errEmailRequired');
      return;
    }
    if (!this.isValidEmail()) {
      this.errorMessage = this.translate.instant('auth.errEmailInvalid');
      return;
    }

    this.isSending = true;
    this.authService.sendEmailOtp(this.email.trim()).subscribe({
      next: () => {
        this.isSending = false;
        this.mode = 'otp';
        this.otpDigits = ['', '', '', '', '', ''];
        this.otp = '';
        this.startCountdown();
        this.startResendCooldown();
      },
      error: (error) => {
        this.isSending = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpSend');
      }
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  // â”€â”€ OTP Input Handling â”€â”€

  onOtpInput(event: any, index: number): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    const digit = raw ? raw[raw.length - 1] : '';

    this.otpDigits[index] = digit;
    input.value = digit;

    if (digit && index < 5) {
      const nextInput = document.getElementById('otp-digit-' + (index + 1));
      if (nextInput) {
        (nextInput as HTMLInputElement).focus();
      }
    }
    this.otp = this.otpDigits.join('');
  }

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      const input = event.target as HTMLInputElement;
      if (!this.otpDigits[index] && index > 0) {
        this.otpDigits[index] = '';
        const prevInput = document.getElementById('otp-digit-' + (index - 1)) as HTMLInputElement;
        if (prevInput) {
          prevInput.value = '';
          prevInput.focus();
        }
      } else {
        this.otpDigits[index] = '';
        input.value = '';
      }
      this.otp = this.otpDigits.join('');
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('');
    for (let i = 0; i < 6; i++) {
      this.otpDigits[i] = digits[i] || '';
      const input = document.getElementById('otp-digit-' + i) as HTMLInputElement;
      if (input) {
        input.value = this.otpDigits[i];
      }
    }
    this.otp = this.otpDigits.join('');

    const lastFilledIndex = Math.min(digits.length, 6) - 1;
    if (lastFilledIndex >= 0 && lastFilledIndex < 6) {
      const lastInput = document.getElementById('otp-digit-' + lastFilledIndex);
      if (lastInput) {
        lastInput.focus();
      }
    } else {
      const firstInput = document.getElementById('otp-digit-0');
      if (firstInput) {
        firstInput.focus();
      }
    }
  }

  // â”€â”€ Verify OTP â”€â”€

  verifyOtp(): void {
    this.errorMessage = '';
    this.otp = this.otpDigits.join('');

    if (this.otp.length !== 6) {
      this.errorMessage = this.translate.instant('auth.errOtpIncomplete');
      return;
    }

    this.isVerifying = true;
    this.authService.verifyEmailOtp(this.email.trim(), this.otp).subscribe({
      next: () => {
        this.isVerifying = false;
        this.navigateToDestination();
      },
      error: (error) => {
        this.isVerifying = false;
        const errKey = error?.error?.errorKey;
        if (errKey === 'otp_expired') {
          this.errorMessage = this.translate.instant('auth.otpExpired');
        } else if (errKey === 'too_many_attempts') {
          this.errorMessage = this.translate.instant('auth.otpTooMany');
        } else if (errKey === 'otp_invalid') {
          this.errorMessage = this.translate.instant('auth.errOtpInvalid');
        } else {
          this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpInvalid');
        }
      }
    });
  }

  // â”€â”€ Google Sign-In â”€â”€

  private handleGoogleCallback(response: any): void {
    if (!response?.credential) return;

    this.isGoogleLoading = true;
    this.errorMessage = '';

    this.authService.googleLogin(response.credential).subscribe({
      next: () => {
        this.isGoogleLoading = false;
        this.navigateToDestination();
      },
      error: (error) => {
        this.isGoogleLoading = false;
        this.errorMessage = error?.error?.message || this.translate.instant('auth.errGoogle');
      }
    });
  }

  // â”€â”€ Countdown Timer â”€â”€

  private startCountdown(): void {
    this.countdown = 300;
    this.updateCountdownDisplay();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      this.updateCountdownDisplay();
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }, 1000);
  }

  private updateCountdownDisplay(): void {
    const minutes = Math.floor(this.countdown / 60);
    const seconds = this.countdown % 60;
    this.countdownDisplay = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  get isCountdownExpired(): boolean {
    return this.countdown <= 0;
  }

  // â”€â”€ Resend Cooldown â”€â”€

  private startResendCooldown(): void {
    this.resendCooldown = 60;
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
    }
    this.resendCooldownTimer = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        clearInterval(this.resendCooldownTimer);
        this.resendCooldownTimer = null;
      }
    }, 1000);
  }

  get canResend(): boolean {
    return this.resendCooldown <= 0;
  }

  resendOtp(): void {
    if (!this.canResend) return;
    this.sendEmailOtp();
  }

  // â”€â”€ Navigation Helpers â”€â”€

  changeEmail(): void {
    this.mode = 'email';
    this.errorMessage = '';
    this.otpDigits = ['', '', '', '', '', ''];
    this.otp = '';
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
      this.resendCooldownTimer = null;
    }
  }

  private navigateToDestination(): void {
    // Clean up the persisted redirect so a later normal visit to /login doesn't
    // accidentally reuse a stale booking URL.
    try { localStorage.removeItem(LOGIN_REDIRECT_LS_KEY); } catch {}
    try { sessionStorage.removeItem('tedbus_login_redirect'); } catch {}

    const user = this.authService.currentUser;
    if (user && !(user as any).profileCompleted) {
      this.router.navigate(['/complete-profile']);
    } else if (this.redirect && this.redirect.startsWith('/')) {
      this.router.navigateByUrl(this.redirect);
    } else {
      this.router.navigate(['/']);
    }
  }

  goToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
