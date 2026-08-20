import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-success-state',
  templateUrl: './success-state.component.html',
  styleUrls: ['./success-state.component.css'],
})
export class SuccessStateComponent {
  @Input() icon = 'check_circle';
  @Input() titleKey = '';
  @Input() subtitleKey = '';
}
