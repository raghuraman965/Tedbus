import { url } from '../../config';

// A guaranteed-to-render fallback image for any hotlinked external photo
// (e.g. Unsplash/Pravatar URLs) that fails to load — a broken photo ID,
// rate limiting, or the person being offline shouldn't ever show a browser's
// broken-image icon. This is a local data URI, so it has zero network
// dependency and cannot itself ever fail to load.
export const IMAGE_FALLBACK_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E" +
  "%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E" +
  "%3Cstop offset='0%25' stop-color='%23D84E55'/%3E%3Cstop offset='100%25' stop-color='%230d1b3d'/%3E" +
  "%3C/linearGradient%3E%3C/defs%3E" +
  "%3Crect width='400' height='300' fill='url(%23g)'/%3E" +
  "%3Cg fill='%23ffffff' fill-opacity='0.85'%3E" +
  "%3Cpath d='M140 120h120a12 12 0 0 1 12 12v46a8 8 0 0 1-8 8h-8a14 14 0 0 1-28 0h-56a14 14 0 0 1-28 0h-8a8 8 0 0 1-8-8v-46a12 12 0 0 1 12-12z'/%3E" +
  "%3Crect x='150' y='130' width='100' height='30' fill='%230d1b3d'/%3E" +
  "%3Ccircle cx='160' cy='186' r='10' fill='%230d1b3d'/%3E" +
  "%3Ccircle cx='240' cy='186' r='10' fill='%230d1b3d'/%3E" +
  "%3C/g%3E%3C/svg%3E";

/** Sets a failed <img>'s src to the local fallback and prevents further error loops. */
export function useImageFallback(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img && img.src !== IMAGE_FALLBACK_DATA_URI) {
    img.src = IMAGE_FALLBACK_DATA_URI;
  }
}

/** Resolves backend-relative image paths (e.g. "/uploads/community/x.png") to
 *  their absolute URL on the API server. Absolute/remote URLs pass through
 *  unchanged. */
export function resolveImageUrl(src: string | null | undefined): string {
  if (src && src.startsWith('/uploads/')) {
    return url.replace(/\/+$/, '') + src;
  }
  return src || '';
}
