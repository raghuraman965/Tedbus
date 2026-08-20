/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace google {
  namespace maps {
    class Map {
      constructor(el: HTMLElement, opts?: any);
      setCenter(latLng: any): void;
      setZoom(zoom: number): void;
      fitBounds(bounds: any, padding?: number): void;
      setOptions(options: any): void;
      getCenter(): any;
      addListener(event: string, handler: Function): any;
    }
    class LatLng {
      lat(): number;
      lng(): number;
    }
    class LatLngBounds {
      constructor();
      extend(point: any): void;
    }
    class Marker {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setPosition(latLng: any): void;
      setLabel(label: any): void;
    }
    class Polyline {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setPath(path: any): void;
    }
    class Point {
      constructor(x: number, y: number);
    }
    const SymbolPath: {
      CIRCLE: number;
    };
    namespace maps {
      class AutocompleteService {
        getQueryPredictions(request: any, callback: (predictions: any[] | null, status: string) => void): void;
      }
      class PlacesService {
        constructor(attrContainer: HTMLElement);
        getDetails(request: any, callback: (result: any, status: string) => void): void;
      }
    }
  }
}
