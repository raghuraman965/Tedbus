import { Component, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, query, stagger, animateChild } from '@angular/animations';
import { AdminLanguageService } from '../../services/admin-language.service';
import { SUPPORTED_LANGUAGES, AppLanguage } from '../../../Premium/services/language.service';
import { prefersReducedMotion } from '../../../Premium/animations/motion-utils';

@Component({
  selector: 'app-admin-language-selector',
  templateUrl: './admin-language-selector.component.html',
  styleUrls: ['./admin-language-selector.component.css'],
  animations: [
    trigger('langPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }),
        animate(
          prefersReducedMotion ? '160ms ease' : '200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' })
        ),
        query('@langItem', stagger(prefersReducedMotion ? 10 : 40, animateChild()), { optional: true })
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('langItem', [
      transition(':enter', [
        style(prefersReducedMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }),
        animate(
          prefersReducedMotion ? '150ms ease' : '260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)' })
        )
      ])
    ])
  ]
})
export class AdminLanguageSelectorComponent implements OnInit, OnDestroy {
  languages: AppLanguage[] = SUPPORTED_LANGUAGES;
  currentLang = 'en';
  open = false;
  panelStyle: { left: string; top: string; minWidth: string } = { left: '0px', top: '0px', minWidth: '210px' };

  private langSub?: Subscription;

  @ViewChild('trigger') triggerEl?: ElementRef<HTMLButtonElement>;

  constructor(private adminLang: AdminLanguageService) {}

  get current(): AppLanguage {
    return this.languages.find(l => l.code === this.currentLang) || this.languages[0];
  }

  ngOnInit(): void {
    this.langSub = this.adminLang.language$.subscribe(lang => {
      this.currentLang = lang;
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
    this.close();
  }

  toggle(): void {
    this.open ? this.close() : this.openPanel();
  }

  openPanel(): void {
    this.positionPanel();
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  select(code: string): void {
    this.close();
    this.adminLang.setLanguage(code);
  }

  private positionPanel(): void {
    const el = this.triggerEl?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(210, rect.width);
    const margin = 12;
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }
    this.panelStyle = { left: `${left}px`, top: `${rect.bottom + 8}px`, minWidth: `${width}px` };
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.open) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.lang-wrap')) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.open) this.positionPanel();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.open) this.positionPanel();
  }
}
