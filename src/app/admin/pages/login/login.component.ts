import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminAuthService } from '../../services/admin-auth.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm!: FormGroup;
  loading = false;
  hidePassword = true;
  returnUrl = '/admin/dashboard';

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authService: AdminAuthService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/admin/dashboard';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    const { username, password } = this.loginForm.value;

    this.authService.login(username, password)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loading = false;
          this.router.navigateByUrl(this.returnUrl);
        },
        error: (err) => {
          this.loading = false;
          const msg = err?.error?.message || this.translate.instant('admin.login.failed');
          this.snackBar.open(msg, this.translate.instant('admin.common.close'), {
            duration: 4000,
            panelClass: ['snack-error'],
          });
        },
      });
  }
}
