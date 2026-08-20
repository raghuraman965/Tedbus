import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import {
  RoutePlannerService,
  SavedRoute
} from '../../../Premium/services/route-planner.service';

@Component({
  selector: 'app-saved-routes',
  templateUrl: './saved-routes.component.html',
  styleUrls: ['./saved-routes.component.css']
})
export class SavedRoutesComponent implements OnInit {
  routes: SavedRoute[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private routePlannerService: RoutePlannerService,
    private router: Router,
    private snackBar: MatSnackBar,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.loadRoutes();
  }

  loadRoutes(): void {
    this.loading = true;
    this.errorMessage = '';
    this.routePlannerService.getSavedRoutes().subscribe({
      next: (res) => {
        this.routes = res.routes || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = this.translate.instant('savedRoutes.loadError');
      }
    });
  }

  formatDuration(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h > 0 && m > 0) return this.translate.instant('savedRoutes.durationHM', { h, m });
    if (h > 0) return this.translate.instant('savedRoutes.durationH', { h });
    return this.translate.instant('savedRoutes.durationM', { m });
  }

  viewRoute(route: SavedRoute): void {
    this.router.navigate(['/route-planner'], { queryParams: { route: route._id } });
  }

  deleteRoute(route: SavedRoute): void {
    if (!route._id) return;
    const routeName = route.name || (route.source + this.translate.instant('savedRoutes.to') + route.destination);
    if (!window.confirm(this.translate.instant('savedRoutes.deleteConfirm', { routeName }))) return;
    this.routePlannerService.deleteSavedRoute(route._id).subscribe({
      next: () => {
        this.routes = this.routes.filter(r => r._id !== route._id);
        this.snackBar.open(this.translate.instant('savedRoutes.deleted'), this.translate.instant('common.ok'), { duration: 2500 });
      },
      error: () => {
        this.snackBar.open(this.translate.instant('savedRoutes.deleteError'), this.translate.instant('common.ok'), { duration: 3000 });
      }
    });
  }

  planNewRoute(): void {
    this.router.navigate(['/route-planner']);
  }
}
