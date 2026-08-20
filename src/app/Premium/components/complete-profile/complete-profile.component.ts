import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { url } from '../../../config';

@Component({
  selector: 'app-complete-profile',
  templateUrl: './complete-profile.component.html',
  styleUrls: ['./complete-profile.component.css']
})
export class CompleteProfileComponent implements OnInit {
  name: string = '';
  phone: string = '';
  dateOfBirth: string = '';
  gender: string = '';
  location: string = '';

  isSaving: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser;
    if (user) {
      this.name = user.name || '';
      this.phone = (user as any).phone || '';
      this.dateOfBirth = (user as any).dateOfBirth || '';
      this.gender = (user as any).gender || '';
      this.location = (user as any).location || '';
    }
    if ((user as any)?.profileCompleted) {
      this.router.navigate(['/']);
    }
  }

  saveProfile(): void {
    if (!this.name.trim()) {
      this.errorMessage = this.translate.instant('completeProfile.errNameRequired');
      return;
    }
    if (!this.phone.trim()) {
      this.errorMessage = this.translate.instant('completeProfile.errPhoneRequired');
      return;
    }
    if (!this.dateOfBirth) {
      this.errorMessage = this.translate.instant('completeProfile.errDobRequired');
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const apiUrl = url + 'profile';
    this.http.put(apiUrl, {
      name: this.name.trim(),
      phone: this.phone.trim(),
      dateOfBirth: this.dateOfBirth,
      gender: this.gender,
      location: this.location.trim(),
      profileCompleted: true
    }).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.successMessage = this.translate.instant('completeProfile.success');
        const updatedUser = { ...this.authService.currentUser, ...res };
        this.authService.updateUser(updatedUser as any);
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1200);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage = err?.error?.error || err?.error?.message || this.translate.instant('completeProfile.errSaveFailed');
      }
    });
  }

  skip(): void {
    this.router.navigate(['/']);
  }
}
