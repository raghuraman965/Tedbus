import { Component, AfterViewInit, Inject } from '@angular/core';
declare var google: any;
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { CustomerService } from '../../../service/customer.service';

type LoginMode = 'email' | 'phone' | 'forgot' | 'phoneSignup';

export interface LoginModalData {
  /** i18n key or plain text shown as a banner explaining why login is needed
   *  (e.g. "Please log in to continue with your booking."). */
  message?: string;
}

@Component({
  selector: 'app-login-modal',
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.css']
})
export class LoginModalComponent implements AfterViewInit {
  mode: LoginMode = 'email';
  dataMessage: string = '';

  email: string = '';
  password: string = '';
  showPassword: boolean = false;
  rememberMe: boolean = false;

  phone: string = '';
  otp: string = '';
  otpSent: boolean = false;
  devOtpHint: string = '';

  signupPhone: string = '';
  signupOtp: string = '';
  signupName: string = '';
  signupOtpSent: boolean = false;
  signupDevOtpHint: string = '';

  forgotEmail: string = '';
  forgotSubmitted: boolean = false;

  isSubmitting: boolean = false;
  errorMessage: string = '';

  constructor(
    private dialogRef: MatDialogRef<LoginModalComponent>,
    private authService: AuthService,
    private customerService: CustomerService,
    private translate: TranslateService,
    @Inject(MAT_DIALOG_DATA) private dialogData?: LoginModalData
  ) {
    this.dataMessage = this.dialogData?.message || '';
  }

  ngAfterViewInit(): void {
    // Google Sign-In is intentionally only initialized here, inside the Login
    // modal, and never on the navbar or homepage.
    google.accounts.id.initialize({
      client_id: '129421237209-jricn8ed4fgld4glk6k716deq5ebsmpb.apps.googleusercontent.com',
      callback: (response: any) => { this.handleGoogleLogin(response); }
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

  startPhoneSignup(): void {
    this.setMode('phoneSignup');
    this.signupPhone = this.phone;
    this.signupOtp = '';
    this.signupName = '';
    this.signupOtpSent = false;
    this.signupDevOtpHint = '';
  }

  sendSignupOtp(): void {
    this.errorMessage = '';
    const phonePattern = /^\d{10}$/;
    if (!phonePattern.test(this.signupPhone.trim())) {
      this.errorMessage = this.translate.instant('auth.errPhone');
      return;
    }

    this.isSubmitting = true;
    this.authService.sendSignupOtp(this.signupPhone.trim()).subscribe({
      next: (result) => {
        this.isSubmitting = false;
        this.signupOtpSent = true;
        // No SMS provider is configured yet, so the OTP is surfaced here for demo purposes.
        this.signupDevOtpHint = this.translate.instant('auth.devOtpHint', { otp: result.otp });
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpSend');
      }
    });
  }

  verifySignupOtp(): void {
    this.errorMessage = '';
    if (!this.signupOtp.trim()) {
      this.errorMessage = this.translate.instant('auth.errOtpEmpty');
      return;
    }

    this.isSubmitting = true;
    this.authService.verifySignupOtp(this.signupPhone.trim(), this.signupOtp.trim(), this.signupName.trim(), this.rememberMe).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpInvalid');
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  close(success: boolean = false): void {
    this.dialogRef.close(success);
  }

  private decodeGoogleToken(token: string) {
    return JSON.parse(atob(token.split('.')[1]));
  }

  handleGoogleLogin(response: any): void {
    const payload = this.decodeGoogleToken(response.credential);
    this.isSubmitting = true;
    this.customerService.addcustomermongo(payload).subscribe({
      next: (result) => {
        this.authService.persistGoogleUser(result as any, true);
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        console.error('Google login failed', error);
        this.errorMessage = this.translate.instant('auth.errGoogle');
        this.isSubmitting = false;
      }
    });
  }

  submitEmailLogin(): void {
    this.errorMessage = '';

    if (!this.email.trim() || !this.password) {
      this.errorMessage = this.translate.instant('auth.errEmailPassword');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(this.email.trim())) {
      this.errorMessage = this.translate.instant('auth.errEmail');
      return;
    }

    this.isSubmitting = true;
    this.authService.login({ email: this.email.trim(), password: this.password }, this.rememberMe).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.error || this.translate.instant('auth.errInvalid');
      }
    });
  }

  sendOtp(): void {
    this.errorMessage = '';
    const phonePattern = /^\d{10}$/;
    if (!phonePattern.test(this.phone.trim())) {
      this.errorMessage = this.translate.instant('auth.errPhone');
      return;
    }

    this.isSubmitting = true;
    this.authService.sendOtp(this.phone.trim()).subscribe({
      next: (result) => {
        this.isSubmitting = false;
        this.otpSent = true;
        // No SMS provider is configured yet, so the OTP is surfaced here for demo purposes.
        this.devOtpHint = this.translate.instant('auth.devOtpHint', { otp: result.otp });
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpSend');
      }
    });
  }

  verifyOtp(): void {
    this.errorMessage = '';
    if (!this.otp.trim()) {
      this.errorMessage = this.translate.instant('auth.errOtpEmpty');
      return;
    }

    this.isSubmitting = true;
    this.authService.verifyOtp(this.phone.trim(), this.otp.trim(), this.rememberMe).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.close(true);
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpInvalid');
      }
    });
  }

  submitForgotPassword(): void {
    if (!this.forgotEmail.trim()) {
      this.errorMessage = this.translate.instant('auth.errForgotEmail');
      return;
    }
    // No email/SMTP service is configured yet (that's part of the notification
    // system phase), so this confirms the request without actually sending an email.
    this.forgotSubmitted = true;
  }
}
