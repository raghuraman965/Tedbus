import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { PaymentSettingsService, PaymentSettings } from '../../../service/payment-settings.service';
import { TranslateService } from '@ngx-translate/core';
import { url } from '../../../config';

@Component({
  selector: 'app-admin-payment-settings',
  templateUrl: './admin-payment-settings.component.html',
  styleUrl: './admin-payment-settings.component.css'
})
export class AdminPaymentSettingsComponent implements OnInit {
  form = new FormGroup({
    merchantName: new FormControl('', [Validators.required]),
    upiId: new FormControl('', [Validators.required, Validators.pattern(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)]),
    accountName: new FormControl(''),
    isActive: new FormControl(true)
  });

  qrPreview: string = '';
  savedQrImage: string = '';
  loading: boolean = true;
  saving: boolean = false;
  savedMessage: string = '';
  saveError: string = '';
  apiBase: string = url;

  constructor(
    private paymentSettingsService: PaymentSettingsService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loading = true;
    this.paymentSettingsService.getSettings().subscribe({
      next: (settings: PaymentSettings) => {
        this.form.patchValue({
          merchantName: settings.merchantName || '',
          upiId: settings.upiId || '',
          accountName: settings.accountName || '',
          isActive: settings.isActive !== false
        });
        this.savedQrImage = settings.qrImage || '';
        this.qrPreview = '';
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.saveError = this.translate.instant('admin.loadError');
      }
    });
  }

  get savedQrUrl(): string {
    if (!this.savedQrImage) return '';
    return this.savedQrImage.startsWith('http')
      ? this.savedQrImage
      : this.apiBase + this.savedQrImage.replace(/^\//, '');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.saveError = this.translate.instant('admin.invalidImage');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.qrPreview = reader.result as string;
      this.savedQrImage = '';
      this.saveError = '';
    };
    reader.readAsDataURL(file);
  }

  removeQr(): void {
    this.qrPreview = '';
    this.savedQrImage = '';
  }

  get activePreview(): string {
    return this.qrPreview || this.savedQrUrl;
  }

  get hasQrImage(): boolean {
    return !!this.qrPreview || !!this.savedQrImage;
  }

  save(): void {
    this.saveError = '';
    this.savedMessage = '';
    if (this.form.invalid) {
      this.saveError = this.translate.instant('admin.invalidForm');
      return;
    }
    this.saving = true;
    const payload: PaymentSettings = {
      merchantName: this.form.value.merchantName || '',
      upiId: this.form.value.upiId || '',
      accountName: this.form.value.accountName || '',
      isActive: !!this.form.value.isActive,
      qrImage: this.qrPreview || undefined as any
    };
    this.paymentSettingsService.updateSettings(payload).subscribe({
      next: (settings) => {
        this.saving = false;
        this.savedQrImage = settings.qrImage || '';
        this.qrPreview = '';
        this.savedMessage = this.translate.instant('admin.saved');
      },
      error: () => {
        this.saving = false;
        this.saveError = this.translate.instant('admin.saveError');
      }
    });
  }
}
