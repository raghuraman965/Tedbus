import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, takeUntil, finalize } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'app-bus-dialog',
  templateUrl: './bus-dialog.component.html',
  styleUrls: ['./bus-dialog.component.css'],
})
export class BusDialogComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  routes: any[] = [];
  saving = false;
  isEdit = false;
  private destroy$ = new Subject<void>();

  busTypes = [
    'AC Sleeper',
    'AC Seater',
    'Non-AC Sleeper',
    'Non-AC Seater',
    'Premium AC',
    'Volvo',
    'Mini',
  ];

  hours = Array.from({ length: 24 }, (_, i) => ({
    value: String(i).padStart(2, '0') + ':00',
    label: String(i).padStart(2, '0') + ':00',
  }));

  private busTypeKeyMap: Record<string, string> = {
    'AC Sleeper': 'adminPanel.busForm.busTypes.acSleeper',
    'AC Seater': 'adminPanel.busForm.busTypes.acSeater',
    'Non-AC Sleeper': 'adminPanel.busForm.busTypes.nonAcSleeper',
    'Non-AC Seater': 'adminPanel.busForm.busTypes.nonAcSeater',
    'Premium AC': 'adminPanel.busForm.busTypes.premiumAc',
    'Volvo': 'adminPanel.busForm.busTypes.volvo',
    'Mini': 'adminPanel.busForm.busTypes.mini',
  };

  constructor(
    private fb: FormBuilder,
    private api: AdminApiService,
    private translate: TranslateService,
    private ref: MatDialogRef<BusDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { bus?: any },
  ) {
    this.isEdit = !!data?.bus;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      operatorName: [this.data?.bus?.operatorName || '', Validators.required],
      busType: [this.data?.bus?.busType || '', Validators.required],
      departureTime: [this.data?.bus?.departureTime || '', Validators.required],
      totalSeats: [this.data?.bus?.totalSeats || 40, [Validators.required, Validators.min(1)]],
      routes: [this.data?.bus?.routes?._id || this.data?.bus?.routes || '', Validators.required],
      images: [this.data?.bus?.images || '', Validators.required],
      liveTracking: [this.data?.bus?.liveTracking || 0, Validators.required],
      reschedulable: [this.data?.bus?.reschedulable || 0, Validators.required],
    });
    this.loadRoutes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRoutes(): void {
    this.api
      .get<any>('routes', { limit: 100 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const d = res.data || res;
          this.routes = d.items || d || [];
        },
        error: () => {},
      });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const val = this.form.value;
    const body: any = {
      operatorName: val.operatorName,
      busType: val.busType,
      departureTime: val.departureTime,
      totalSeats: Number(val.totalSeats),
      routes: val.routes,
      rating: [0],
      images: val.images || 'default-bus.jpg',
      liveTracking: Number(val.liveTracking) || 0,
      reschedulable: Number(val.reschedulable) || 0,
    };
    const obs = this.isEdit
      ? this.api.put<any>(`buses/${this.data.bus._id || this.data.bus.id}`, body)
      : this.api.post<any>('buses', body);

    obs.pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.saving = false)),
    ).subscribe({
      next: () => this.ref.close(true),
      error: () => {},
    });
  }

  busTypeLabel(t: string): string {
    return this.translate.instant(this.busTypeKeyMap[t] || t);
  }

  close(): void {
    this.ref.close(false);
  }
}
