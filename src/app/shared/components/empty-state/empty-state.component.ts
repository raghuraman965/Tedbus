import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.css'],
})
export class EmptyStateComponent {
  @Input() icon = 'inbox';
  @Input() titleKey = '';
  @Input() subtitleKey = '';
  @Input() actionLabelKey = '';
  @Input() actionRoute = '';

  constructor(private router: Router) {}

  onAction(): void {
    if (this.actionRoute) {
      this.router.navigate([this.actionRoute]);
    }
  }
}
