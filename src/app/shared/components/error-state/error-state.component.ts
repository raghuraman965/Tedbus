import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.component.html',
  styleUrls: ['./error-state.component.css'],
})
export class ErrorStateComponent {
  @Input() errorMessage = '';
  @Input() showRetry = true;

  @Output() retry = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
  }
}
