export interface Route {
    _id: string;
    id?: string;
    departureLocation: {
      name: string;
      subLocations: string[];
    };
    arrivalLocation: {
      name: string;
      subLocations: string[];
    };
    duration: number;
    stops?: any[];
    totalDistanceKm?: number;
    fareConfig?: any;
  }