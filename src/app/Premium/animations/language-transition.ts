import { trigger, state, style, transition, animate } from '@angular/animations';
import { prefersReducedMotion } from './motion-utils';

export const languageTransition = trigger('languageTransition', [
  state('in', style({
    opacity: 1,
    transform: 'none'
  })),
  state('out', style({
    opacity: 0.85,
    transform: 'none'
  })),
  transition('in => out', animate(prefersReducedMotion
    ? '80ms ease-in'
    : '100ms ease-in'
  )),
  transition('out => in', animate(prefersReducedMotion
    ? '100ms ease-out'
    : '150ms cubic-bezier(0.22, 1, 0.36, 1)'
  ))
]);
