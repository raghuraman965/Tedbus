import { trigger, transition, style, animate } from '@angular/animations';
import { prefersReducedMotion } from './motion-utils';

// Entrance used by bus cards and community cards. It is bound to the active
// language, so whenever the language changes every card visibly "settles" into
// its new text: opacity + translateY(8px → 0) + scale(0.98 → 1). Purely
// transform/opacity based, so nothing in the layout moves and the browser can
// run it on the GPU. Reduced-motion users get a short fade only.
export const cardEntrance = trigger('cardEntrance', [
  transition('* => *', [
    style(prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, transform: 'translateY(8px) scale(0.98)' }),
    animate(
      prefersReducedMotion ? '200ms ease' : '320ms ease-out',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' })
    )
  ])
]);
