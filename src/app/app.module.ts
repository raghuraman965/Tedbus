import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {MatMenuModule} from '@angular/material/menu';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './shared/shared.module';
import { NavbarComponent } from './Component/navbar/navbar.component';
import { FooterComponent } from './Component/footer/footer.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LandingPageComponent } from './Component/landing-page/landing-page.component';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {provideNativeDateAdapter} from '@angular/material/core';
import { MatDialogModule} from '@angular/material/dialog';
import { DialogComponent } from './Component/landing-page/dialog/dialog.component';
import {MatTableModule} from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { SelectbusPageComponent } from './Component/selectbus-page/selectbus-page.component';
import { HeaderComponent } from './Component/selectbus-page/header/header.component';
import { LeftComponent } from './Component/selectbus-page/left/left.component';
import { RightComponent } from './Component/selectbus-page/right/right.component';
import {MatIconModule} from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { SortingBarComponent } from './Component/selectbus-page/right/sorting-bar/sorting-bar.component';
import { BusBoxComponent } from './Component/selectbus-page/right/bus-box/bus-box.component'; 
import {MatDividerModule} from '@angular/material/divider';
import {MatSidenavModule} from '@angular/material/sidenav';
import { BottomTabComponent } from './Component/selectbus-page/right/bus-book/bottom-tab/bottom-tab.component';
import { ViewSeatsComponent } from './Component/selectbus-page/right/view-seats/view-seats.component';
import { PaymentPageComponent } from './Component/payment-page/payment-page.component';
import { ProfilePageComponent } from './Component/profile-page/profile-page.component';
import { MyTripComponent } from './Component/profile-page/my-trip/my-trip.component';
import { BookingConfirmationComponent } from './Component/booking-confirmation/booking-confirmation.component';
import { ViewTicketComponent } from './Component/view-ticket/view-ticket.component';
import { DriverVerifyComponent } from './Component/driver-verify/driver-verify.component';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { PremiumNavbarComponent } from './Premium/components/premium-navbar/premium-navbar.component';
import { PremiumFooterComponent } from './Premium/components/premium-footer/premium-footer.component';
import { PremiumHomeComponent } from './Premium/components/premium-home/premium-home.component';
import { AuthLandingComponent } from './Premium/components/auth-landing/auth-landing.component';
import { LoginModalComponent } from './Premium/components/login-modal/login-modal.component';
import { EmailOtpLoginComponent } from './Premium/components/email-otp-login/email-otp-login.component';
import { SignupPageComponent } from './Premium/components/signup-page/signup-page.component';
import { PremiumSearchResultsComponent } from './Premium/components/premium-search-results/premium-search-results.component';
import { ComingSoonPageComponent } from './Premium/components/coming-soon-page/coming-soon-page.component';
import { ThemeToggleComponent } from './Premium/components/theme-toggle/theme-toggle.component';
import { LanguageSelectorComponent } from './Premium/components/language-selector/language-selector.component';
import { PremiumBookingDrawerComponent } from './Premium/components/premium-booking-drawer/premium-booking-drawer.component';
import { AdminPaymentSettingsComponent } from './Premium/components/admin-payment-settings/admin-payment-settings.component';
import { ReactiveFormsModule } from '@angular/forms';
import { SavedRoutesComponent } from './Component/profile-page/saved-routes/saved-routes.component';
import { TranslateModule, TranslateLoader, MissingTranslationHandler, MissingTranslationHandlerParams } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { LanguageService } from './Premium/services/language.service';
import { NotificationCenterComponent } from './Premium/components/notification-center/notification-center.component';
import { NotificationHistoryComponent } from './Premium/components/notification-history/notification-history.component';
import { NotificationPreferencesComponent } from './Premium/components/notification-preferences/notification-preferences.component';
import { EditProfileComponent } from './Component/profile-page/edit-profile/edit-profile.component';
import { CompleteProfileComponent } from './Premium/components/complete-profile/complete-profile.component';
import { VerificationRequestComponent } from './Premium/components/verification-request/verification-request.component';
import { BusTrackingComponent } from './Premium/components/bus-tracking/bus-tracking.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './shared/auth.interceptor';
import { RouteReviewsComponent } from './Premium/components/route-reviews/route-reviews.component';

// Lazy-loads each language file (assets/i18n/<lang>.json) only when needed.
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

export function initLanguage(languageService: LanguageService) {
  return () => languageService.init();
}

// When a key is missing in every catalog (current + English), return a readable
// fallback instead of the raw key path — e.g. dynamic server status values.
export class HumanizedMissingHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    const parts = params.key.split('.');
    const last = parts[parts.length - 1] || params.key;
    return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  }
}

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    FooterComponent,
    LandingPageComponent,
    DialogComponent,
    SelectbusPageComponent,
    HeaderComponent,
    LeftComponent,
    RightComponent,
    SortingBarComponent,
    BusBoxComponent,
    BottomTabComponent,
    ViewSeatsComponent,
    PaymentPageComponent,
    ProfilePageComponent,
    MyTripComponent,
    PremiumNavbarComponent,
    PremiumFooterComponent,
    PremiumHomeComponent,
    AuthLandingComponent,
    LoginModalComponent,
    EmailOtpLoginComponent,
    SignupPageComponent,
    PremiumSearchResultsComponent,
    ComingSoonPageComponent,
    ThemeToggleComponent,
    PremiumBookingDrawerComponent,
    AdminPaymentSettingsComponent,
    SavedRoutesComponent,
    BookingConfirmationComponent,
    ViewTicketComponent,
    DriverVerifyComponent,
    NotificationCenterComponent,
    NotificationHistoryComponent,
    NotificationPreferencesComponent,
    EditProfileComponent,
    CompleteProfileComponent,
    VerificationRequestComponent,
    BusTrackingComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MatMenuModule,
    MatButtonModule,
    BrowserAnimationsModule,
    MatDatepickerModule,
    MatDialogModule,
    MatTableModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    CommonModule,
    MatSidenavModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    HttpClientModule,
    SharedModule,
    RouteReviewsComponent,
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      missingTranslationHandler: { provide: MissingTranslationHandler, useClass: HumanizedMissingHandler },
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    })
  ],
  providers: [
    provideNativeDateAdapter(),
    {
      provide: APP_INITIALIZER,
      useFactory: initLanguage,
      deps: [LanguageService],
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
