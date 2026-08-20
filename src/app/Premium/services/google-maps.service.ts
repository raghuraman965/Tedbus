import { Injectable } from '@angular/core';
import { googleMapsApiKey } from '../../config';

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise<void>((resolve, reject) => {
      if (!googleMapsApiKey) {
        this.loadPromise = null;
        reject(new Error('Google Maps API key not configured'));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&callback=__googleMapsInit`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        this.loadPromise = null;
        reject(new Error('Failed to load Google Maps script'));
      };

      (window as any).__googleMapsInit = () => {
        resolve();
      };

      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  reset(): void {
    this.loadPromise = null;
  }

  isLoaded(): boolean {
    return typeof window !== 'undefined' && !!(window as any).google?.maps;
  }

  get google(): any {
    return (window as any).google;
  }
}
