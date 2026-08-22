import { Component, AfterViewInit, Inject } from '@angular/core';
declare var google: any;
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

type LoginMode = 'email' | 'otp';

export interface LoginModalData {
  /** i18n key or plain text shown as a banner explaining why login is needed
   *  (e.g. "Please log in to continue with your booking."). */
  message?: string;
}

/**
 * The ONE login experience used across the app (booking drawer, seat
 * selection, auth landing). Email OTP + Google only - both verified
 * server-side. Mirrors the /login page flow exactly.
 */
@Component({
  selector: 'app-login-modal',
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.css']
})
export class LoginModalComponent implements AfterViewInit {
  mode: LoginMode = 'email';
  dataMessage: string = '';

  email: string = '';
  otpDigits: string[] = ['', '', '', '', '', ''];
  otp: string = '';

  isSubmitting: boolean = false;
  errorMessage: string = '';

  countdown: number = 300;
  countdownDisplay: string = '05:00';
  private countdownTimer: any = null;

  resendCooldown: number = 0;
  private resendCooldownTimer: any = null;

  private readonly GOOGLE_CLIENT_ID = '129421237209-jricn8ed4fgld4glk6k716deq5ebsmpb.apps.googleusercontent.com';

  constructor(
    private dialogRef: MatDialogRef<LoginModalComponent>,
    private authService: AuthService,
    private translate: TranslateService,
    @Inject(MAT_DIALOG_DATA) private dialogData?: LoginModalData
  ) {
    this.dataMessage = this.dialogData?.message || '';
  }

  ngAfterViewInit(): void {
    this.initGoogleSignIn();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.resendCooldownTimer) clearInterval(this.resendCooldownTimer);
  }

  private initGoogleSignIn(): void {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;
    google.accounts.id.initialize({
      client_id: this.GOOGLE_CLIENT_ID,
      callback: (response: any) => this.handleGoogleLogin(response)
    });

    const googleBtn = document.getElementById('login-modal-google-btn');
    if (googleBtn) {
      google.accounts.id.renderButton(googleBtn, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 280,
      });
    }
  }

  setMode(mode: LoginMode): void {
    this.mode = mode;
    this.errorMessage = '';
  }

  close(success: boolean = false): void {
    this.dialogRef.close(success);
  }

  // â”€â”€ Email Validation â”€â”€

  isValidEmail(): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(this.email.trim());
  }

  // â”€â”€ Send Email OTP â”€â”€

  sendOtp(): void {
    this.errorMessage = '';
    if (!this.email.trim()) {
      this.errorMessage = this.translate.instant('auth.errEmailRequired');
      return;
    }
    if (!this.isValidEmail()) {
      this.errorMessage = this.translate.instant('auth.errEmailInvalid');
      return;
    }

    this.isSubmitting = true;
    this.authService.sendEmailOtp(this.email.trim()).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.setMode('otp');
        this.otpDigits = ['', '', '', '', '', ''];
        this.otp = '';
        this.startCountdown();
        this.startResendCooldown();
      },
      error: (error) => {
        this.isSubmitting = false;
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
      const nextInput = document.getElementById('login-modal-otp-digit-' + (index + 1));
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
        const prevInput = document.getElementById('login-modal-otp-digit-' + (index - 1)) as HTMLInputElement;
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
      const input = document.getElementById('login-modal-otp-digit-' + i) as HTMLInputElement;
      if (input) {
        input.value = this.otpDigits[i];
      }
    }
    this.otp = this.otpDigits.join('');

    const lastFilledIndex = Math.min(digits.length, 6) - 1;
    if (lastFilledIndex >= 0 && lastFilledIndex < 6) {
      const lastInput = document.getElementById('login-modal-otp-digit-' + lastFilledIndex);
      if (lastInput) {
        lastInput.focus();
      }
    } else {
      const firstInput = document.getElementById('login-modal-otp-digit-0');
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

    this.isSubmitting = true;
    this.authService.verifyEmailOtp(this.email.trim(), this.otp).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        this.isSubmitting = false;
        const errKey = error?.error?.errorKey;
        if (errKey === 'otp_expired') {
          this.errorMessage = this.translate.instant('auth.otpExpired');
        } else if (errKey === 'too_many_attempts') {
          this.errorMessage = this.translate.instant('auth.otpTooMany');
        } else {
          this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpInvalid');
        }
      }
    });
  }

  // â”€â”€ Google Sign-In (verified server-side via /auth/google-login) â”€â”€

  handleGoogleLogin(response: any): void {
    if (!response?.credential) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.authService.googleLogin(response.credential).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        console.error('Google login failed', error);
        this.errorMessage = error?.error?.message || this.translate.instant('auth.errGoogle');
        this.isSubmitting = false;
      }
    });
  }

  // â”€â”€ Countdown Timer â”€â”€

  private startCountdown(): void {
    this.countdown = 300;
    this.updateCountdownDisplay();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
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
    if (this.resendCooldownTimer) clearInterval(this.resendCooldownTimer);
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
    this.sendOtp();
  }

  changeEmail(): void {
    this.setMode('email');
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
}
