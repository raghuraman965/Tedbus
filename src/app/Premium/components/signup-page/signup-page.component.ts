import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup-page',
  templateUrl: './signup-page.component.html',
  styleUrls: ['./signup-page.component.css']
})
export class SignupPageComponent {
  signupTab: 'email' | 'phone' = 'email';

  fullName: string = '';
  email: string = '';
  phone: string = '';
  password: string = '';
  confirmPassword: string = '';
  acceptedTerms: boolean = false;

  showPassword: boolean = false;
  showConfirmPassword: boolean = false;

  otpSent: boolean = false;
  signupOtp: string = '';
  devOtpHint: string = '';

  isSubmitting: boolean = false;
  submitted: boolean = false;
  errorMessage: string = '';
  fieldErrors: { [key: string]: string } = {};

  constructor(private authService: AuthService, private router: Router, private translate: TranslateService) { }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  switchTab(tab: 'email' | 'phone'): void {
    this.signupTab = tab;
    this.errorMessage = '';
    this.fieldErrors = {};
    this.otpSent = false;
    this.signupOtp = '';
    this.devOtpHint = '';
  }

  get passwordStrength(): 'weak' | 'medium' | 'strong' | '' {
    const pwd = this.password;
    if (!pwd) return '';
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const score = [pwd.length >= 8, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    if (score <= 1) return 'weak';
    if (score <= 3) return 'medium';
    return 'strong';
  }

  private validate(): boolean {
    this.fieldErrors = {};

    if (!this.fullName.trim()) {
      this.fieldErrors['fullName'] = this.translate.instant('auth.errFullName');
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email.trim()) {
      this.fieldErrors['email'] = this.translate.instant('auth.errEmailRequired');
    } else if (!emailPattern.test(this.email.trim())) {
      this.fieldErrors['email'] = this.translate.instant('auth.errEmail');
    }

    const phonePattern = /^\d{10}$/;
    if (!this.phone.trim()) {
      this.fieldErrors['phone'] = this.translate.instant('auth.errPhoneRequired');
    } else if (!phonePattern.test(this.phone.trim())) {
      this.fieldErrors['phone'] = this.translate.instant('auth.errPhone');
    }

    if (!this.password) {
      this.fieldErrors['password'] = this.translate.instant('auth.errPasswordRequired');
    } else if (this.password.length < 6) {
      this.fieldErrors['password'] = this.translate.instant('auth.errPasswordLength');
    }

    if (!this.confirmPassword) {
      this.fieldErrors['confirmPassword'] = this.translate.instant('auth.errConfirmRequired');
    } else if (this.confirmPassword !== this.password) {
      this.fieldErrors['confirmPassword'] = this.translate.instant('auth.errPasswordMismatch');
    }

    if (!this.acceptedTerms) {
      this.fieldErrors['terms'] = this.translate.instant('auth.errTerms');
    }

    return Object.keys(this.fieldErrors).length === 0;
  }

  submit(): void {
    this.errorMessage = '';
    if (!this.validate()) {
      return;
    }

    this.isSubmitting = true;
    this.authService.signup({
      name: this.fullName.trim(),
      email: this.email.trim(),
      phone: this.phone.trim(),
      password: this.password
    }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.submitted = true;
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1800);
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.error || this.translate.instant('auth.errSignup');
        const field = error?.error?.field;
        if (field === 'email' || field === 'phone') {
          this.fieldErrors[field] = this.errorMessage;
        }
      }
    });
  }

  sendPhoneOtp(): void {
    this.errorMessage = '';
    this.fieldErrors = {};

    const phonePattern = /^\d{10}$/;
    if (!this.phone.trim()) {
      this.fieldErrors['phone'] = this.translate.instant('auth.errPhoneRequired');
      return;
    }
    if (!phonePattern.test(this.phone.trim())) {
      this.fieldErrors['phone'] = this.translate.instant('auth.errPhone');
      return;
    }

    if (!this.acceptedTerms) {
      this.fieldErrors['terms'] = this.translate.instant('auth.errTerms');
      return;
    }

    this.isSubmitting = true;
    this.authService.sendSignupOtp(this.phone.trim()).subscribe({
      next: (result) => {
        this.isSubmitting = false;
        this.otpSent = true;
        this.devOtpHint = this.translate.instant('auth.devOtpHint', { otp: result.otp });
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpSend');
      }
    });
  }

  verifyPhoneSignup(): void {
    this.errorMessage = '';
    if (!this.signupOtp.trim()) {
      this.fieldErrors['otp'] = this.translate.instant('auth.errOtpEmpty');
      return;
    }

    this.isSubmitting = true;
    this.authService.verifySignupOtp(this.phone.trim(), this.signupOtp.trim(), this.fullName.trim(), true).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.submitted = true;
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1800);
      },
      error: (error) => {
        this.isSubmitting = false;
        this.errorMessage = error?.error?.message || error?.error?.error || this.translate.instant('auth.errOtpInvalid');
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
