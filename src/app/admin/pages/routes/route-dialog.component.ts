import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, takeUntil, finalize } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'app-route-dialog',
  templateUrl: './route-dialog.component.html',
  styleUrls: ['./route-dialog.component.css'],
})
export class RouteDialogComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  saving = false;
  isEdit = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: AdminApiService,
    private ref: MatDialogRef<RouteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { route?: any },
  ) {
    this.isEdit = !!data?.route;
  }

  ngOnInit(): void {
    const r = this.data?.route;
    this.form = this.fb.group({
      routeName: [r?.routeName || '', Validators.required],
      sourceName: [r?.departureLocation?.name || '', Validators.required],
      destinationName: [r?.arrivalLocation?.name || '', Validators.required],
      duration: [r?.duration || '', Validators.required],
      totalDistanceKm: [r?.totalDistanceKm || '', [Validators.required, Validators.min(0)]],
      baseFare: [r?.fareConfig?.baseFare || 0, [Validators.required, Validators.min(0)]],
      pricePerKm: [r?.fareConfig?.pricePerKm || 0, Validators.min(0)],
      taxPercent: [r?.fareConfig?.taxPercent || 0, Validators.min(0)],
      serviceFee: [r?.fareConfig?.serviceFee || 0, Validators.min(0)],
      isActive: [r?.isActive !== undefined ? r.isActive : true],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const val = this.form.value;
    const body: any = {
      routeName: val.routeName,
      departureLocation: { name: val.sourceName },
      arrivalLocation: { name: val.destinationName },
      duration: Number(val.duration),
      totalDistanceKm: Number(val.totalDistanceKm),
      fareConfig: {
        baseFare: Number(val.baseFare),
        pricePerKm: Number(val.pricePerKm),
        taxPercent: Number(val.taxPercent),
        serviceFee: Number(val.serviceFee),
      },
      isActive: val.isActive,
    };

    const obs = this.isEdit
      ? this.api.put<any>('routes/' + (this.data.route._id || this.data.route.id), body)
      : this.api.post<any>('routes', body);

    obs.pipe(
      takeUntil(this.destroy$),
      finalize(() => (this.saving = false)),
    ).subscribe({
      next: () => this.ref.close(true),
      error: () => {},
    });
  }

  close(): void {
    this.ref.close(false);
  }
}
