import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { CityService } from './city.service';

/**
 * Localized city input (presenter).
 *
 * Binds `[cityInput]` to the component's city model (canonical English after
 * selection, raw text while typing). The directive:
 *
 * - never touches the model or ngModel binding (no value-accessor takeover);
 * - while the user is typing it leaves the text alone;
 * - on language change it re-renders the displayed value translated,
 *   preserving the caret;
 * - when the bound value changes outside editing it re-renders translated.
 *
 * Canonicalization of the typed value back to English is done by the
 * components before sending data to the backend / MongoDB.
 */
@Directive({
  selector: 'input[cityInput], textarea[cityInput]'
})
export class CityInputDirective implements OnChanges, OnInit, OnDestroy {
  @Input() cityInput: string | null = null;

  private editing = false;
  private langSub: Subscription | null = null;

  constructor(
    private el: ElementRef,
    private translate: TranslateService,
    private cityService: CityService
  ) {}

  ngOnInit(): void {
    this.langSub = this.translate.onLangChange.subscribe(() => this.redraw());
    this.redraw();
  }

  ngOnDestroy(): void {
    if (this.langSub) this.langSub.unsubscribe();
  }

  ngOnChanges(): void {
    if (!this.editing) this.redraw();
  }

  private redraw(): void {
    const localized = this.cityService.toDisplay(this.cityInput);
    const host = this.el.nativeElement as HTMLInputElement;
    if (host.value === localized) return;
    const pos = host.selectionStart ?? host.value.length;
    host.value = localized;
    try {
      host.setSelectionRange(pos, pos);
    } catch {
      /* non-text inputs ignore selection */
    }
  }

  @HostListener('input')
  onInput(): void {
    this.editing = true;
  }

  @HostListener('blur')
  onBlur(): void {
    this.editing = false;
    this.redraw();
  }
}
