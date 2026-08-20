import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../Premium/components/language-selector/language-selector.component';
import { CityInputDirective } from './city-input.directive';
import { CityNamePipe } from './city-name.pipe';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { ErrorStateComponent } from './components/error-state/error-state.component';
import { OfflineBannerComponent } from './components/offline-banner/offline-banner.component';
import { LoadingStateComponent } from './components/loading-state/loading-state.component';
import { SuccessStateComponent } from './components/success-state/success-state.component';
import { TextTransitionDirective } from '../Premium/animations/text-transition.directive';

@NgModule({
  declarations: [
    LanguageSelectorComponent,
    CityInputDirective,
    CityNamePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    OfflineBannerComponent,
    LoadingStateComponent,
    SuccessStateComponent,
    TextTransitionDirective,
  ],
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, TranslateModule],
  exports: [
    LanguageSelectorComponent,
    CityInputDirective,
    CityNamePipe,
    EmptyStateComponent,
    ErrorStateComponent,
    OfflineBannerComponent,
    LoadingStateComponent,
    SuccessStateComponent,
    TextTransitionDirective,
  ],
})
export class SharedModule {}
