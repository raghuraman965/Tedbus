import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  templateUrl: './loading-state.component.html',
  styleUrls: ['./loading-state.component.css'],
})
export class LoadingStateComponent {
  @Input() messageKey = 'common.loading';
}
