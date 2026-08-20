import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent } from './dialog/dialog.component';
import { BusService } from '../../service/bus.service';
import { CityService } from '../../shared/city.service';
import { TranslateService } from '@ngx-translate/core';
@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit {
  fromoption: string = ''
  tooption: string = ''
  date: string = ''
  fromOptions: string[] = ['Delhi', 'Mumbai', 'Bangalore', 'Kolkata', 'Chennai'];
  toOptions: string[] = ['Jaipur', 'Goa', 'Mysore', 'Darjeeling', 'Pondicherry'];
  availableRoutes: { departure: string; arrival: string }[] = [];
  constructor(private router: Router, public dialog: MatDialog, private busService: BusService, private cityService: CityService, private translate: TranslateService) { }

  ngOnInit(): void {
    this.busService.GETAVAILABLEROUTES().subscribe({
      next: (res) => {
        const items = (res?.routes || []).filter((r: any) => r.departure && r.arrival);
        this.availableRoutes = items;
        if (items.length) {
          const fromSet = new Set<string>();
          const toSet = new Set<string>();
          for (const r of items) {
            fromSet.add(r.departure);
            toSet.add(r.arrival);
          }
          this.fromOptions = Array.from(fromSet);
          this.toOptions = Array.from(toSet);
        }
      },
      error: () => {
        this.availableRoutes = [];
      },
    });
  }

  fromEvent(option: string) {
    this.fromoption = option;
    console.log(this.fromoption)
  }
  toEvent(option: string) {
    this.tooption = option;
  }
  matchDate(event: any) {
    if (event.value) {
      const date = new Date(event.value);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString();
      this.date = `${year}-${month}-${day}`;
    } else {
      this.date = 'null';
    }
    console.log(this.date)
  }
  submit() {
    const from = this.cityService.toCanonical(this.fromoption);
    const to = this.cityService.toCanonical(this.tooption);
    if (from && to && this.date) {
      const hardcodedValid = from === 'Delhi' && to === 'Jaipur' || from === 'Mumbai' && to === 'Goa' || from === 'Bangalore' && to === 'Mysore' || from === 'Kolkata' && to === 'Darjeeling' || from === 'Chennai' && to === 'Pondicherry';
      const isValid = this.availableRoutes.length
        ? this.availableRoutes.some(r =>
            r.departure.toLowerCase() === from.toLowerCase() &&
            r.arrival.toLowerCase() === to.toLowerCase())
        : hardcodedValid;
      if (isValid) {
        this.router.navigate(['/select-bus'],{
          queryParams:{
            departure:from,
            arrival:to,
            date:this.date
          }
        });
      } else {
        const dialogRef = this.dialog.open(DialogComponent);

        dialogRef.afterClosed().subscribe(result => {
          console.log(`Dialog result: ${result}`);
        });
      }
    } else {
      alert(this.translate.instant('home.search.fillUpDetails'))
    }
  }
}
