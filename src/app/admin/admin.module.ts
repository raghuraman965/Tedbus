import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../shared/shared.module';
import { AdminRoutingModule } from './admin-routing.module';

import { ShellComponent as AdminShellComponent } from './shell/shell.component';
import { LoginComponent as AdminLoginComponent } from './pages/login/login.component';
import { AdminDashboardComponent } from './pages/dashboard/dashboard.component';
import { AdminBookingsComponent } from './pages/bookings/bookings.component';
import { AdminBusesComponent } from './pages/buses/buses.component';
import { BusDialogComponent } from './pages/buses/bus-dialog.component';
import { AdminRoutesComponent } from './pages/routes/routes.component';
import { RouteDialogComponent } from './pages/routes/route-dialog.component';
import { AdminCustomersComponent } from './pages/customers/customers.component';
import { AdminPaymentsComponent } from './pages/payments/payments.component';
import { AdminNotificationsComponent } from './pages/notifications/notifications.component';
import { AdminOffersComponent } from './pages/offers/offers.component';
import { AdminReportsComponent } from './pages/reports/reports.component';
import { AdminSettingsComponent } from './pages/settings/settings.component';
import { AdminReviewsComponent } from './pages/reviews/reviews.component';
import { AdminVerificationComponent } from './pages/verification/verification.component';
import { AdminCommunityModerationComponent } from './pages/community-moderation/community-moderation.component';
import { AdminLanguageSelectorComponent } from './components/admin-language-selector/admin-language-selector.component';

@NgModule({
  declarations: [
    AdminShellComponent,
    AdminLoginComponent,
    AdminDashboardComponent,
    AdminBookingsComponent,
    AdminBusesComponent,
    BusDialogComponent,
    AdminRoutesComponent,
    RouteDialogComponent,
    AdminCustomersComponent,
    AdminPaymentsComponent,
    AdminNotificationsComponent,
    AdminOffersComponent,
    AdminReportsComponent,
    AdminReviewsComponent,
    AdminVerificationComponent,
    AdminCommunityModerationComponent,
    AdminSettingsComponent,
    AdminLanguageSelectorComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    AdminRoutingModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    MatCardModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatButtonToggleModule,
    SharedModule,
    TranslateModule.forChild(),
  ],
})
export class AdminModule {}
