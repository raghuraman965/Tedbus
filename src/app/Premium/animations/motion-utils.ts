/**
 * Shared motion preference, read once at boot.
 * When the user asks the OS for reduced motion, all premium animations in the
 * app degrade to a simple, safe opacity fade (no scale, no blur, no stagger).
 */
export const prefersReducedMotion: boolean =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
