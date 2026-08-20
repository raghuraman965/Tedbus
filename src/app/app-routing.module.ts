import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingPageComponent } from './Component/landing-page/landing-page.component';
import { SelectbusPageComponent } from './Component/selectbus-page/selectbus-page.component';
import { PaymentPageComponent } from './Component/payment-page/payment-page.component';
import { ProfilePageComponent } from './Component/profile-page/profile-page.component';
import { PremiumHomeComponent } from './Premium/components/premium-home/premium-home.component';
import { AuthLandingComponent } from './Premium/components/auth-landing/auth-landing.component';
import { EmailOtpLoginComponent } from './Premium/components/email-otp-login/email-otp-login.component';
import { SignupPageComponent } from './Premium/components/signup-page/signup-page.component';
import { PremiumSearchResultsComponent } from './Premium/components/premium-search-results/premium-search-results.component';
import { AdminPaymentSettingsComponent } from './Premium/components/admin-payment-settings/admin-payment-settings.component';
import { ComingSoonPageComponent } from './Premium/components/coming-soon-page/coming-soon-page.component';
import { BookingConfirmationComponent } from './Component/booking-confirmation/booking-confirmation.component';
import { ViewTicketComponent } from './Component/view-ticket/view-ticket.component';
import { DriverVerifyComponent } from './Component/driver-verify/driver-verify.component';
import { NotificationHistoryComponent } from './Premium/components/notification-history/notification-history.component';
import { NotificationPreferencesComponent } from './Premium/components/notification-preferences/notification-preferences.component';
import { BookingAuthGuard } from './service/booking-auth.guard';
import { CompleteProfileComponent } from './Premium/components/complete-profile/complete-profile.component';
import { VerificationRequestComponent } from './Premium/components/verification-request/verification-request.component';
import { BusTrackingComponent } from './Premium/components/bus-tracking/bus-tracking.component';
const routes: Routes = [
  {path: '',component:PremiumHomeComponent},
  {path: 'classic-home',component:LandingPageComponent},
  {path: 'select-bus',component:PremiumSearchResultsComponent},
  {path: 'classic-select-bus',component:SelectbusPageComponent},
  {path:'payment',component:PaymentPageComponent, canActivate: [BookingAuthGuard]},
  {path:'profile',component:ProfilePageComponent, canActivate: [BookingAuthGuard]},
  {path:'login',component:EmailOtpLoginComponent},
  {path:'login-legacy',component:AuthLandingComponent},
  {path:'signup',component:SignupPageComponent},
  {path:'complete-profile',component:CompleteProfileComponent},
  {path:'verify-account',component:VerificationRequestComponent, canActivate: [BookingAuthGuard]},
  {path:'admin/payment-settings',component:AdminPaymentSettingsComponent},
  {path:'booking-confirmation/:pnr',component:BookingConfirmationComponent, canActivate: [BookingAuthGuard]},
  {path:'ticket/:pnr',component:ViewTicketComponent, canActivate: [BookingAuthGuard]},
  {path:'driver/verify',component:DriverVerifyComponent},
  {path:'notifications',component:NotificationHistoryComponent, canActivate: [BookingAuthGuard]},
  {path:'notifications/preferences',component:NotificationPreferencesComponent, canActivate: [BookingAuthGuard]},
  {path:'cab-rental',component:ComingSoonPageComponent,data:{service:'cab'}},
  {path:'train-tickets',component:ComingSoonPageComponent,data:{service:'train'}},
  {path:'admin',loadChildren:() => import('./admin/admin.module').then(m => m.AdminModule)},
  {path:'community',loadChildren:() => import('./Community/community.module').then(m => m.CommunityModule)},
  {path:'route-planner',loadChildren:() => import('./Premium/components/route-planner/route-planner.module').then(m => m.RoutePlannerModule)},
  {path:'track-bus/:busId/:date',component:BusTrackingComponent},
  {path: '**', redirectTo: ''}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
