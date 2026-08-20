import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../Premium/services/language.service';

@Pipe({
  name: 'timeAgo',
  pure: false
})
export class TimeAgoPipe implements PipeTransform {
  constructor(private translate: TranslateService, private language: LanguageService) {}

  transform(value: string | Date): string {
    if (!value) return '';
    const date = new Date(value);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 0 || isNaN(seconds)) return this.translate.instant('community.timeAgo.justNow');
    if (seconds < 60) return this.translate.instant('community.timeAgo.justNow');

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return this.translate.instant('community.timeAgo.minutesAgo', { minutes });

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return this.translate.instant('community.timeAgo.hoursAgo', { hours });

    const days = Math.floor(hours / 24);
    if (days < 7) return this.translate.instant('community.timeAgo.daysAgo', { days });

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return this.translate.instant('community.timeAgo.weeksAgo', { weeks });

    return date.toLocaleDateString(this.language.getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
