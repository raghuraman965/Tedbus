import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { routeFadeSlide } from './Premium/animations/route-animations';
import { languageTransition } from './Premium/animations/language-transition';
import { LanguageService } from './Premium/services/language.service';
import { AdminLanguageService } from './admin/services/admin-language.service';
import { NotificationRealtimeService } from './service/notification-realtime.service';
import { PushNotificationService } from './service/push-notification.service';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  animations: [routeFadeSlide, languageTransition]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'frontend';
  isAdminRoute = false;
  langTransitionState: 'in' | 'out' = 'in';
  private routerSub?: Subscription;
  private langSub?: Subscription;
  private lastContext: 'admin' | 'customer' = 'customer';

  constructor(
    private router: Router,
    private languageService: LanguageService,
    private adminLanguageService: AdminLanguageService,
    private realtime: NotificationRealtimeService,
    private push: PushNotificationService
  ) {
    this.langSub = this.languageService.transitionState$.subscribe(state => {
      this.langTransitionState = state;
    });
  }

  ngOnInit(): void {
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        const wasAdmin = this.isAdminRoute;
        this.isAdminRoute = event.urlAfterRedirects.startsWith('/admin');

        if (this.isAdminRoute && !wasAdmin) {
          this.adminLanguageService.activate();
        } else if (!this.isAdminRoute && wasAdmin) {
          this.languageService.activate();
        }
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.langSub?.unsubscribe();
  }

  getRouteAnimationState(outlet: RouterOutlet): string {
    return outlet?.activatedRouteData?.['animation'] || outlet?.activatedRoute?.snapshot?.url?.join('/') || 'default';
  }
}
