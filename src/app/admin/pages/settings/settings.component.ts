import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../Premium/services/theme.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class AdminSettingsComponent implements OnInit, OnDestroy {
  currentTheme: string = 'light';
  adminProfile: any = null;
  private themeSub?: Subscription;

  constructor(
    private theme: ThemeService,
    private auth: AdminAuthService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.currentTheme = this.theme.applied;
    this.themeSub = this.theme.applied$.subscribe((t: 'light' | 'dark') => {
      this.currentTheme = t;
    });
    this.adminProfile = this.auth.profile;
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  setTheme(mode: string): void {
    this.theme.setTheme(mode as any);
  }

  t(key: string): string {
    return this.translate.instant(key);
  }
}
