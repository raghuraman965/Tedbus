import { Pipe, PipeTransform } from '@angular/core';
import { CityService } from './city.service';

/**
 * Maps English city names (from MongoDB / the API / static arrays) to their
 * translated form using the CITY.* translation keys. The database is never
 * touched: the pipe only maps the value at render time.
 *
 * Handles plain city names ("Delhi"), legacy aliases ("Bengaluru", "Bombay")
 * and combined strings such as "Delhi, India", "Delhi → Jaipur" or
 * "Mumbai - Dadar" by translating the known tokens and leaving everything
 * else untouched. Unmapped values fall back to the original string.
 *
 * Word boundaries are Unicode-aware so translated Indic-script tokens
 * (e.g. "दिल्ली", "சென்னை") are recognized correctly.
 */
@Pipe({ name: 'cityName', pure: false })
export class CityNamePipe implements PipeTransform {
  constructor(private cityService: CityService) { }

  transform(value?: string | null): string {
    return this.cityService.toDisplay(value);
  }
}
