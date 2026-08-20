import { trigger, transition, style, query, group, animate } from '@angular/animations';

// A subtle, non-intrusive fade + slide used for route/page transitions across
// the app. Kept short (220ms) and gentle per the "do not overuse animations"
// guidance — this is meant to smooth navigation, not draw attention to itself.
export const routeFadeSlide = trigger('routeAnimations', [
  transition('* <=> *', [
    query(':enter, :leave', [
      style({ position: 'absolute', width: '100%' })
    ], { optional: true }),
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(10px)' })
    ], { optional: true }),
    group([
      query(':leave', [
        animate('160ms ease-out', style({ opacity: 0 }))
      ], { optional: true }),
      query(':enter', [
        animate('220ms 60ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ], { optional: true })
    ])
  ])
]);
