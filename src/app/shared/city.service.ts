import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

interface CityEntry {
  canonical: string;
  key: string;
  aliases: string[];
}

const CITIES: CityEntry[] = [
  { canonical: 'Delhi', key: 'CITY.DELHI', aliases: ['Delhi', 'New Delhi', 'NewDelhi'] },
  { canonical: 'Mumbai', key: 'CITY.MUMBAI', aliases: ['Mumbai', 'Bombay'] },
  { canonical: 'Bangalore', key: 'CITY.BANGALORE', aliases: ['Bangalore', 'Bengaluru'] },
  { canonical: 'Kolkata', key: 'CITY.KOLKATA', aliases: ['Kolkata', 'Calcutta'] },
  { canonical: 'Chennai', key: 'CITY.CHENNAI', aliases: ['Chennai', 'Madras'] },
  { canonical: 'Jaipur', key: 'CITY.JAIPUR', aliases: ['Jaipur'] },
  { canonical: 'Goa', key: 'CITY.GOA', aliases: ['Goa'] },
  { canonical: 'Mysore', key: 'CITY.MYSORE', aliases: ['Mysore', 'Mysuru'] },
  { canonical: 'Darjeeling', key: 'CITY.DARJEELING', aliases: ['Darjeeling'] },
  { canonical: 'Pondicherry', key: 'CITY.PONDICHERRY', aliases: ['Pondicherry', 'Puducherry'] },
  { canonical: 'Hyderabad', key: 'CITY.HYDERABAD', aliases: ['Hyderabad'] },
  { canonical: 'Pune', key: 'CITY.PUNE', aliases: ['Pune'] },
  { canonical: 'Ahmedabad', key: 'CITY.AHMEDABAD', aliases: ['Ahmedabad'] },
  { canonical: 'Kochi', key: 'CITY.KOCHI', aliases: ['Kochi', 'Cochin'] },
  { canonical: 'Varanasi', key: 'CITY.VARANASI', aliases: ['Varanasi'] },
  { canonical: 'Shimla', key: 'CITY.SHIMLA', aliases: ['Shimla'] }
];

const INDIA_CANONICAL = 'India';

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * Bidirectional city-name translation.
 *
 * - toDisplay()/localize(): English / alias token -> translated label (render only).
 * - toCanonical()/canonicalize(): English, alias OR translated token -> canonical
 *   English name (the value that is stored in MongoDB / sent to the API).
 *
 * The MongoDB / API layer always keeps canonical English; the translated text is
 * produced purely at render time. Unknown tokens are left untouched, so combined
 * strings such as "Delhi → Jaipur", "Mumbai - Dadar" or "Delhi, India" survive.
 */
@Injectable({ providedIn: 'root' })
export class CityService {
  private displayMapCache = new Map<string, Map<string, string>>();
  private canonicalMapCache = new Map<string, Map<string, string>>();

  constructor(private translate: TranslateService) {}

  get cityNames(): string[] {
    return CITIES.map(c => c.canonical);
  }

  /** English/alias token -> translated label (per current language). */
  private displayMap(): Map<string, string> {
    const lang = this.translate.currentLang || 'en';
    let map = this.displayMapCache.get(lang);
    if (map) return map;
    map = new Map<string, string>();
    for (const c of CITIES) {
      const label = this.translate.instant(c.key);
      for (const a of c.aliases) map.set(a.toLowerCase(), label);
    }
    map.set(INDIA_CANONICAL.toLowerCase(), this.translate.instant('common.india'));
    this.displayMapCache.set(lang, map);
    return map;
  }

  /** English/alias/translated token -> canonical English name (per current language). */
  private canonicalMap(): Map<string, string> {
    const lang = this.translate.currentLang || 'en';
    let map = this.canonicalMapCache.get(lang);
    if (map) return map;
    map = new Map<string, string>();
    for (const c of CITIES) {
      for (const a of c.aliases) map.set(a.toLowerCase(), c.canonical);
      map.set(this.translate.instant(c.key).trim().toLowerCase(), c.canonical);
    }
    map.set(this.translate.instant('common.india').trim().toLowerCase(), INDIA_CANONICAL);
    this.canonicalMapCache.set(lang, map);
    return map;
  }

  private replaceTokens(text: string, map: Map<string, string>): string {
    if (!text) return text;
    const keys = Array.from(map.keys())
      .filter(k => k.length > 0)
      .sort((a, b) => b.length - a.length);
    if (!keys.length) return text;
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])(?:${keys.map(k => k.replace(ESCAPE_RE, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}])`,
      'giu'
    );
    let changed = false;
    const out = text.replace(re, (full, pre: string) => {
      const token = full.slice(pre.length).toLowerCase();
      const replacement = map.get(token);
      if (replacement === undefined) return full;
      changed = true;
      return pre + replacement;
    });
    return changed ? out : text;
  }

  /** Translate English / alias city tokens to the current language (render only). */
  toDisplay(text?: string | null): string {
    if (!text) return text ?? '';
    const trimmed = text.trim();
    if (!trimmed) return text;
    const out = this.replaceTokens(trimmed, this.displayMap());
    return out === trimmed ? text : out;
  }

  /** Resolve English, alias OR translated city tokens back to canonical English. */
  toCanonical(text?: string | null): string {
    if (!text) return text ?? '';
    const trimmed = text.trim();
    if (!trimmed) return text;
    const out = this.replaceTokens(trimmed, this.canonicalMap());
    return out === trimmed ? text : out;
  }

  localize(text?: string | null): string {
    return this.toDisplay(text);
  }

  canonicalize(text?: string | null): string {
    return this.toCanonical(text);
  }

  /** True when `query` (English, alias or translated, possibly partial) matches `city`. */
  matches(city: string, query: string): boolean {
    const q = (query || '').trim().toLowerCase();
    if (!q) return true;
    const entry = CITIES.find(c => c.canonical.toLowerCase() === (city || '').trim().toLowerCase());
    if (!entry) return (city || '').toLowerCase().includes(q);
    if (entry.canonical.toLowerCase().includes(q)) return true;
    if (entry.aliases.some(a => a.toLowerCase().includes(q))) return true;
    return this.translate.instant(entry.key).toLowerCase().includes(q);
  }

  /** If `text` fully matches a single known city (any language / alias) return its canonical name. */
  resolveCity(text?: string | null): string | null {
    const t = (text || '').trim().toLowerCase();
    if (!t) return null;
    for (const c of CITIES) {
      if (c.canonical.toLowerCase() === t) return c.canonical;
      if (c.aliases.some(a => a.toLowerCase() === t)) return c.canonical;
      if (this.translate.instant(c.key).trim().toLowerCase() === t) return c.canonical;
    }
    return null;
  }
}
