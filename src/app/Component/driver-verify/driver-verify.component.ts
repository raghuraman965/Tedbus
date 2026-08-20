import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { BusService } from '../../service/bus.service';
import { TranslateService } from '@ngx-translate/core';
import jsQR from 'jsqr';
import { bookingStatusInfo, displayPnr } from '../../utils/booking-display';

@Component({
  selector: 'app-driver-verify',
  templateUrl: './driver-verify.component.html',
  styleUrl: './driver-verify.component.css'
})
export class DriverVerifyComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: false }) videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasEl!: ElementRef<HTMLCanvasElement>;

  scanning: boolean = false;
  cameraError: string = '';
  manualPnr: string = '';
  verifying: boolean = false;
  result: any = null;
  resultType: 'allowed' | 'rejected' | null = null;
  resultMessage: string = '';

  private stream: MediaStream | null = null;
  private rafId: number = 0;
  private scanTimer: any = null;
  private stopped = false;

  constructor(
    private busservice: BusService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopScanning();
  }

  startScanning(): void {
    this.cameraError = '';
    this.result = null;
    this.resultType = null;
    this.stopped = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.cameraError = this.translate.instant('driver.noCamera');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then((stream) => {
      this.stream = stream;
      this.scanning = true;
      setTimeout(() => {
        const video = this.videoEl?.nativeElement;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.play().catch(() => {});
        this.loop();
      }, 50);
    }).catch(() => {
      this.cameraError = this.translate.instant('driver.cameraDenied');
    });
  }

  private loop(): void {
    if (this.stopped) return;
    this.scan();
    this.scanTimer = setTimeout(() => this.loop(), 250);
  }

  private scan(): void {
    const video = this.videoEl?.nativeElement;
    const canvas = this.canvasEl?.nativeElement;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    if (video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      this.stopScanning();
      this.verify({ qrData: code.data });
    }
  }

  verify(body: { qrData?: string; pnr?: string }): void {
    if (this.verifying) return;
    this.verifying = true;
    this.result = null;
    this.resultType = null;
    this.busservice.verifyTicket(body).subscribe({
      next: (res) => {
        this.verifying = false;
        const allowed = res?.allowedToBoard === true;
        const booking = res?.booking || {};
        this.result = booking;
        if (allowed) {
          this.resultType = 'allowed';
          this.resultMessage = res?.message || this.translate.instant('driver.allowedMessage');
        } else {
          this.resultType = 'rejected';
          this.resultMessage = res?.valid === false
            ? this.translate.instant('driver.ticketCancelled')
            : this.translate.instant('driver.ticketInvalid');
        }
      },
      error: (err) => {
        this.verifying = false;
        this.resultType = 'rejected';
        this.resultMessage = err?.error?.error || this.translate.instant('driver.ticketInvalid');
      }
    });
  }

  manualVerify(): void {
    const pnr = this.manualPnr.trim().toUpperCase();
    if (!pnr) return;
    this.verify({ pnr });
  }

  stopScanning(): void {
    this.stopped = true;
    this.scanning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = this.videoEl?.nativeElement;
    if (video) video.srcObject = null;
  }

  reset(): void {
    this.stopScanning();
    this.result = null;
    this.resultType = null;
    this.resultMessage = '';
    this.cameraError = '';
  }

  get statusBadge() {
    if (!this.result) return null;
    return bookingStatusInfo({ ...this.result, status: this.result?.bookingStatus });
  }
  get pnrDisplay() { return this.result ? displayPnr(this.result) : '--'; }
  seatsLabel(): string {
    const seats = this.result?.seats || [];
    return seats.length ? seats.map((s: any) => `S${s}`).join(', ') : '--';
  }
}
