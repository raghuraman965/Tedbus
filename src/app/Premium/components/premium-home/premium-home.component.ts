import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { useImageFallback } from '../../utils/image-fallback';
import { DialogComponent } from '../../../Component/landing-page/dialog/dialog.component';
import { BusService } from '../../../service/bus.service';
import { CityService } from '../../../shared/city.service';

interface Route {
  from: string;
  to: string;
  price: string;
  image: string;
}

interface Destination {
  name: string;
  image: string;
  trips: string;
}

interface Offer {
  code: string;
  titleKey: string;
  subtitleKey: string;
  gradient: string;
}

interface Review {
  name: string;
  avatarSeed: string;
  rating: number;
  textKey: string;
  routeKey: string;
}

interface Stat {
  value: string;
  labelKey: string;
  icon: string;
}

interface WhyItem {
  icon: string;
  titleKey: string;
  descriptionKey: string;
}

@Component({
  selector: 'app-premium-home',
  templateUrl: './premium-home.component.html',
  styleUrls: ['./premium-home.component.css']
})
export class PremiumHomeComponent implements OnInit {
  fromoption: string = '';
  tooption: string = '';
  date: string = '';

  // Round trip / return date
  isRoundTrip: boolean = false;
  returnDate: string = '';

  // Passengers
  passengers: number = 1;
  minPassengers: number = 1;
  maxPassengers: number = 6;

  // Autocomplete state
  fromQuery: string = '';
  toQuery: string = '';
  showFromSuggestions: boolean = false;
  showToSuggestions: boolean = false;

  private defaultCities: string[] = ['Delhi', 'Mumbai', 'Bangalore', 'Kolkata', 'Chennai', 'Jaipur', 'Goa', 'Mysore', 'Darjeeling', 'Pondicherry'];

  cities: string[] = [...this.defaultCities];

  availableRoutes: { departure: string; arrival: string; busCount: number }[] = [];

  ngOnInit(): void {
    this.busService.GETAVAILABLEROUTES().subscribe({
      next: (res) => {
        const items = res?.routes || [];
        this.availableRoutes = items.filter((r: any) => r.departure && r.arrival);
        const extraCities = new Set<string>();
        for (const r of this.availableRoutes) {
          extraCities.add(r.departure);
          extraCities.add(r.arrival);
        }
        this.cities = Array.from(new Set([...this.defaultCities, ...extraCities]));
      },
      error: () => {
        this.availableRoutes = [];
      },
    });
  }

  get filteredFromCities(): string[] {
    return this.filterCities(this.fromQuery);
  }

  get filteredToCities(): string[] {
    return this.filterCities(this.toQuery);
  }

  private filterCities(query: string): string[] {
    return this.cities.filter(city => this.cityService.matches(city, query));
  }

  featuredRoutes: Route[] = [
    { from: 'Delhi', to: 'Jaipur', price: '₹499', image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=500&q=80' },
    { from: 'Mumbai', to: 'Goa', price: '₹899', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80' },
    { from: 'Bangalore', to: 'Mysore', price: '₹399', image: 'https://images.unsplash.com/photo-1657856855186-7cf4909a4f78?w=500&q=80&fit=crop' },
    { from: 'Kolkata', to: 'Darjeeling', price: '₹649', image: 'https://images.unsplash.com/photo-1544986581-efac024faf62?w=500&q=80' },
    { from: 'Chennai', to: 'Pondicherry', price: '₹349', image: 'https://images.unsplash.com/photo-1567337710282-00832b415979?w=500&q=80' }
  ];

  trendingDestinations: Destination[] = [
    { name: 'Goa', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80', trips: '2,400+' },
    { name: 'Jaipur', image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=500&q=80', trips: '1,800+' },
    { name: 'Darjeeling', image: 'https://images.unsplash.com/photo-1544986581-efac024faf62?w=500&q=80', trips: '1,200+' },
    { name: 'Mysore', image: 'https://images.unsplash.com/photo-1657856855186-7cf4909a4f78?w=500&q=80&fit=crop', trips: '980+' }
  ];

  offers: Offer[] = [
    { code: 'FIRST', titleKey: 'home.offers.first.title', subtitleKey: 'home.offers.first.subtitle', gradient: 'linear-gradient(135deg, #2b5876, #4e4376)' },
    { code: 'SOUTH300', titleKey: 'home.offers.south.title', subtitleKey: 'home.offers.south.subtitle', gradient: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))' },
    { code: 'WEEKEND150', titleKey: 'home.offers.weekend.title', subtitleKey: 'home.offers.weekend.subtitle', gradient: 'linear-gradient(135deg, #11998e, #38ef7d)' },
    { code: 'APP200', titleKey: 'home.offers.app.title', subtitleKey: 'home.offers.app.subtitle', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)' }
  ];

  whyChooseUs: WhyItem[] = [
    { icon: 'verified_user', titleKey: 'home.why.trusted', descriptionKey: 'home.why.trustedDesc' },
    { icon: 'payments', titleKey: 'home.why.price', descriptionKey: 'home.why.priceDesc' },
    { icon: 'support_agent', titleKey: 'home.why.support', descriptionKey: 'home.why.supportDesc' },
    { icon: 'event_seat', titleKey: 'home.why.seats', descriptionKey: 'home.why.seatsDesc' }
  ];

  reviews: Review[] = [
    { name: 'Ananya Sharma', avatarSeed: '32', rating: 5, textKey: 'home.reviews.review1', routeKey: 'home.reviews.route1' },
    { name: 'Rahul Verma', avatarSeed: '12', rating: 5, textKey: 'home.reviews.review2', routeKey: 'home.reviews.route2' },
    { name: 'Priya Nair', avatarSeed: '47', rating: 4, textKey: 'home.reviews.review3', routeKey: 'home.reviews.route3' }
  ];

  stats: Stat[] = [
    { value: '25M+', labelKey: 'home.stats.customers', icon: 'sentiment_satisfied' },
    { value: '3,500+', labelKey: 'home.stats.operators', icon: 'directions_bus' },
    { value: '90,000+', labelKey: 'home.stats.routes', icon: 'route' },
    { value: '4.6★', labelKey: 'home.stats.rating', icon: 'star' }
  ];

  constructor(private router: Router, public dialog: MatDialog, private translate: TranslateService, private busService: BusService, private cityService: CityService) { }

  onImageError = useImageFallback;

  fromEvent(option: string): void {
    this.fromoption = option;
    this.fromQuery = option;
    this.showFromSuggestions = false;
  }

  toEvent(option: string): void {
    this.tooption = option;
    this.toQuery = option;
    this.showToSuggestions = false;
  }

  onFromInput(value: string): void {
    this.fromQuery = value;
    this.fromoption = this.cityService.resolveCity(value) ?? '';
    this.showFromSuggestions = true;
  }

  onToInput(value: string): void {
    this.toQuery = value;
    this.tooption = this.cityService.resolveCity(value) ?? '';
    this.showToSuggestions = true;
  }

  closeFromSuggestions(): void {
    // Slight delay so a click on a suggestion registers before the list closes.
    setTimeout(() => this.showFromSuggestions = false, 150);
  }

  closeToSuggestions(): void {
    setTimeout(() => this.showToSuggestions = false, 150);
  }

  swapCities(): void {
    const temp = this.fromoption;
    this.fromoption = this.tooption;
    this.tooption = temp;

    const tempQuery = this.fromQuery;
    this.fromQuery = this.toQuery;
    this.toQuery = tempQuery;
  }

  incrementPassengers(): void {
    if (this.passengers < this.maxPassengers) {
      this.passengers++;
    }
  }

  decrementPassengers(): void {
    if (this.passengers > this.minPassengers) {
      this.passengers--;
    }
  }

  toggleRoundTrip(): void {
    this.isRoundTrip = !this.isRoundTrip;
    if (!this.isRoundTrip) {
      this.returnDate = 'null';
    }
  }

  matchDate(event: any): void {
    if (event.value) {
      const date = new Date(event.value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString();
      this.date = `${year}-${month}-${day}`;
    } else {
      this.date = 'null';
    }
  }

  matchReturnDate(event: any): void {
    if (event.value) {
      const date = new Date(event.value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString();
      this.returnDate = `${year}-${month}-${day}`;
    } else {
      this.returnDate = 'null';
    }
  }

  submit(): void {
    const from = this.cityService.toCanonical(this.fromoption);
    const to = this.cityService.toCanonical(this.tooption);
    if (from && to && this.date) {
      const validPairs = [
        ['Delhi', 'Jaipur'], ['Mumbai', 'Goa'], ['Bangalore', 'Mysore'],
        ['Kolkata', 'Darjeeling'], ['Chennai', 'Pondicherry']
      ];
      const fallbackValid = validPairs.some(([f, t]) => f === from && t === to);
      const isValid = this.availableRoutes.length
        ? this.availableRoutes.some(r =>
            r.departure.toLowerCase() === from.toLowerCase() &&
            r.arrival.toLowerCase() === to.toLowerCase())
        : fallbackValid;

      if (isValid) {
        this.router.navigate(['/select-bus'], {
          queryParams: {
            departure: from,
            arrival: to,
            date: this.date,
            passengers: this.passengers,
            returnDate: this.isRoundTrip ? this.returnDate : undefined
          }
        });
      } else {
        const dialogRef = this.dialog.open(DialogComponent);
        dialogRef.afterClosed().subscribe(() => { });
      }
      } else {
        alert(this.translate.instant('home.fillDetails'));
      }
  }

  quickSearch(from: string, to: string): void {
    this.fromoption = from;
    this.fromQuery = from;
    this.tooption = to;
    this.toQuery = to;
  }
}
