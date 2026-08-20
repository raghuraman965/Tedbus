import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  constructor(private translate: TranslateService) {}

  getErrorMessage(error: any): string {
    if (error.status === 0) {
      return this.translate.instant('errors.networkError');
    }
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      return this.translate.instant('errors.timeout');
    }

    switch (error.status) {
      case 400:
        return this.translate.instant('errors.badRequest');
      case 401:
        return this.translate.instant('errors.unauthorized');
      case 403:
        return this.translate.instant('errors.forbidden');
      case 404:
        return this.translate.instant('errors.notFound');
      case 409:
        return this.translate.instant('errors.conflict');
      case 422:
        return this.translate.instant('errors.validation');
      case 429:
        return this.translate.instant('errors.tooManyRequests');
      case 500:
        return this.translate.instant('errors.serverError');
      default:
        return this.translate.instant('errors.unexpected');
    }
  }

  getBookingErrorMessage(error: any): string {
    if (error.status === 409) {
      return this.translate.instant('errors.seatConflict') || this.translate.instant('errors.conflict');
    }
    if (error.status === 422) {
      return this.translate.instant('errors.bookingValidation') || this.translate.instant('errors.validation');
    }
    if (error.status === 400) {
      return this.translate.instant('errors.invalidBooking') || this.translate.instant('errors.badRequest');
    }
    return this.getErrorMessage(error);
  }

  isNetworkError(error: any): boolean {
    return error.status === 0 || !!error.name?.includes('HttpErrorResponse');
  }
}
