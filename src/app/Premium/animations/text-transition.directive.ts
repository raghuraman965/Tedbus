import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  NgZone
} from '@angular/core';
import { Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';

@Directive({
  selector: '[tedTextTransition]'
})
export class TextTransitionDirective implements OnInit, OnDestroy {
  private langSub?: Subscription;
  private currentLang = '';
  private readonly reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private el: ElementRef<HTMLElement>,
    private languageService: LanguageService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.currentLang = this.languageService.currentLang;

    this.langSub = this.languageService.language$.subscribe(lang => {
      if (lang === this.currentLang) return;
      this.currentLang = lang;
      this.animateTextChange();
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  private animateTextChange(): void {
    const element = this.el.nativeElement;
    if (!element) return;

    this.ngZone.runOutsideAngular(() => {
      if (this.reducedMotion) {
        element.classList.add('ted-text-exit');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('ted-text-exit');
            element.classList.add('ted-text-settle');
            const cleanup = () => {
              element.classList.remove('ted-text-settle');
              element.removeEventListener('transitionend', cleanup);
            };
            element.addEventListener('transitionend', cleanup, { once: true });
          });
        });
        return;
      }

      element.classList.remove('ted-text-settle');
      element.classList.add('ted-text-exit');

      const onExit = () => {
        element.removeEventListener('transitionend', onExit);
        element.classList.remove('ted-text-exit');
        element.classList.add('ted-text-enter');

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('ted-text-enter');
            element.classList.add('ted-text-settle');

            const onSettle = () => {
              element.classList.remove('ted-text-settle');
              element.removeEventListener('transitionend', onSettle);
            };
            element.addEventListener('transitionend', onSettle, { once: true });
          });
        });
      };

      element.addEventListener('transitionend', onExit, { once: true });

      setTimeout(() => {
        if (element.classList.contains('ted-text-exit')) {
          onExit();
        }
      }, 150);
    });
  }
}
