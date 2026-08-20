import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { url } from '../../../config';

@Component({
  selector: 'app-verification-request',
  templateUrl: './verification-request.component.html',
  styleUrls: ['./verification-request.component.css']
})
export class VerificationRequestComponent implements OnInit {
  mode: 'form' | 'status' = 'form';

  fullName: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  gender: string = '';
  address: string = '';
  idProofType: string = 'aadhaar';
  idProofNumber: string = '';
  reason: string = '';

  isSubmitting: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  requestStatus: any = null;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser;
    if (user) {
      this.fullName = user.name || '';
      this.phone = user.phone || '';
    }
    this.checkStatus();
  }

  checkStatus(): void {
    this.http.get(url + 'verification/status').subscribe({
      next: (res: any) => {
        if (res.hasRequest) {
          this.requestStatus = res;
          this.mode = 'status';
        } else {
          this.requestStatus = null;
          this.mode = 'form';
        }
      }
    });
  }

  submitRequest(): void {
    if (!this.fullName.trim() || !this.phone.trim() || !this.dateOfBirth) {
      this.errorMessage = this.translate.instant('verificationRequest.validationError');
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.http.post(url + 'verification/request', {
      fullName: this.fullName.trim(),
      phone: this.phone.trim(),
      dateOfBirth: this.dateOfBirth,
      gender: this.gender,
      address: this.address.trim(),
      idProofType: this.idProofType,
      idProofNumber: this.idProofNumber.trim(),
      reason: this.reason.trim()
    }).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        this.successMessage = this.translate.instant('verificationRequest.submitSuccess');
        this.checkStatus();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err?.error?.error || this.translate.instant('verificationRequest.submitFailed');
      }
    });
  }

  submitNewRequest(): void {
    this.requestStatus = null;
    this.mode = 'form';
    this.successMessage = '';
    this.errorMessage = '';
  }
}
