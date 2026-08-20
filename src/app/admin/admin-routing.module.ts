import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminAuthGuard } from './guards/admin-auth.guard';

import { LoginComponent as AdminLoginComponent } from './pages/login/login.component';
import { ShellComponent as AdminShellComponent } from './shell/shell.component';
import { AdminDashboardComponent } from './pages/dashboard/dashboard.component';
import { AdminBookingsComponent } from './pages/bookings/bookings.component';
import { AdminBusesComponent } from './pages/buses/buses.component';
import { AdminRoutesComponent } from './pages/routes/routes.component';
import { AdminCustomersComponent } from './pages/customers/customers.component';
import { AdminPaymentsComponent } from './pages/payments/payments.component';
import { AdminNotificationsComponent } from './pages/notifications/notifications.component';
import { AdminOffersComponent } from './pages/offers/offers.component';
import { AdminReportsComponent } from './pages/reports/reports.component';
import { AdminSettingsComponent } from './pages/settings/settings.component';
import { AdminReviewsComponent } from './pages/reviews/reviews.component';
import { AdminVerificationComponent } from './pages/verification/verification.component';
import { AdminCommunityModerationComponent } from './pages/community-moderation/community-moderation.component';

const routes: Routes = [
  { path: 'login', component: AdminLoginComponent },
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [AdminAuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'bookings', component: AdminBookingsComponent },
      { path: 'buses', component: AdminBusesComponent },
      { path: 'routes', component: AdminRoutesComponent },
      { path: 'customers', component: AdminCustomersComponent },
      { path: 'payments', component: AdminPaymentsComponent },
      { path: 'notifications', component: AdminNotificationsComponent },
      { path: 'offers', component: AdminOffersComponent },
      { path: 'reports', component: AdminReportsComponent },
      { path: 'reviews', component: AdminReviewsComponent },
      { path: 'verification', component: AdminVerificationComponent },
      { path: 'moderation', component: AdminCommunityModerationComponent },
      { path: 'settings', component: AdminSettingsComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
