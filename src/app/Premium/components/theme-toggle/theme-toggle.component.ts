import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ThemeService, ThemeMode } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.css']
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  mode: ThemeMode = 'light';
  applied: 'light' | 'dark' = 'light';
  private animating = false;

  private sub?: Subscription;
  private appliedSub?: Subscription;

  private static readonly VT_SUPPORTED =
    typeof document !== 'undefined' &&
    typeof (document as any).startViewTransition === 'function';

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.sub = this.themeService.theme$.subscribe(m => this.mode = m);
    this.appliedSub = this.themeService.applied$.subscribe(a => this.applied = a);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.appliedSub?.unsubscribe();
  }

  toggle(event: MouseEvent): void {
    if (this.animating) return;
    this.animating = true;

    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    const el = document.documentElement;
    // Clean any stale values from a previous transition before setting new ones
    el.style.removeProperty('--reveal-x');
    el.style.removeProperty('--reveal-y');
    el.style.setProperty('--reveal-x', x + 'px');
    el.style.setProperty('--reveal-y', y + 'px');

    if (ThemeToggleComponent.VT_SUPPORTED) {
      this.vtTransition(el, x, y);
    } else {
      this.overlayFallback(el, x, y);
    }
  }

  /** View Transition API path — the CSS keyframes on
   *  ::view-transition-new(root) animate the circular clip-path. */
  private vtTransition(el: HTMLElement, _x: number, _y: number): void {
    try {
      const vt = (document as any).startViewTransition(() => {
        this.themeService.toggleTheme();
      });
      // Wait for the FULL animation to finish (not just "ready") so the
      // snapshot pseudo-elements are removed by the browser, then clean up
      // the custom properties so they don't leak into future snapshots.
      const done = () => {
        el.style.removeProperty('--reveal-x');
        el.style.removeProperty('--reveal-y');
        this.animating = false;
      };
      vt.finished.then(done).catch(done);
      // Safety net: force cleanup if finished never resolves
      setTimeout(done, 1200);
    } catch {
      this.overlayFallback(el, _x, _y);
    }
  }

  /** Fallback for browsers without View Transition API.
   *  Creates a temporary overlay with the NEW theme background,
   *  starts it at clip-path circle(0%), then expands to full screen.
   *  The actual theme only changes once the overlay fully covers the
   *  viewport, so the user never sees a flash. */
  private overlayFallback(el: HTMLElement, x: number, y: number): void {
    const newTheme = this.applied === 'dark' ? 'light' : 'dark';
    const newBg = newTheme === 'dark' ? '#1E1E24' : '#ffffff';

    const overlay = document.createElement('div');
    overlay.className = 'ted-theme-reveal';
    overlay.style.backgroundColor = newBg;
    document.body.appendChild(overlay);

    // Force layout so the initial clip-path is applied before we expand
    overlay.getBoundingClientRect();

    requestAnimationFrame(() => {
      overlay.classList.add('expand');

      const onDone = () => {
        overlay.removeEventListener('transitionend', onDone);
        this.themeService.toggleTheme();
        this.removeOverlay(overlay);
      };

      overlay.addEventListener('transitionend', onDone, { once: true });

      // Safety: if transitionend never fires (e.g. reduced-motion), force it
      setTimeout(onDone, 650);
    });
  }

  private removeOverlay(overlay: HTMLElement): void {
    if (overlay.parentNode) {
      overlay.style.transition = 'none';
      overlay.style.clipPath = 'none';
      // Allow one frame for style to apply, then remove
      requestAnimationFrame(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.documentElement.style.removeProperty('--reveal-x');
        document.documentElement.style.removeProperty('--reveal-y');
        this.animating = false;
      });
    } else {
      document.documentElement.style.removeProperty('--reveal-x');
      document.documentElement.style.removeProperty('--reveal-y');
      this.animating = false;
    }
  }

  private finish(): void {
    this.animating = false;
  }
}
