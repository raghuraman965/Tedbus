import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NetworkStatusService } from '../../network-status.service';

@Component({
  selector: 'app-offline-banner',
  templateUrl: './offline-banner.component.html',
  styleUrls: ['./offline-banner.component.css'],
})
export class OfflineBannerComponent implements OnInit, OnDestroy {
  isOffline = false;
  showBackOnline = false;

  private subs: Subscription[] = [];

  constructor(private networkStatus: NetworkStatusService) {}

  ngOnInit(): void {
    this.subs.push(
      this.networkStatus.onlineStatus$.subscribe((online) => {
        if (!online) {
          this.isOffline = true;
          this.showBackOnline = false;
        } else if (this.isOffline) {
          this.isOffline = false;
          this.showBackOnline = true;
          setTimeout(() => {
            this.showBackOnline = false;
          }, 3000);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
