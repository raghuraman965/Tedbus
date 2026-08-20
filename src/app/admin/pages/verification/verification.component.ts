import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { url } from '../../../config';

@Component({
  selector: 'app-admin-verification',
  templateUrl: './verification.component.html',
  styleUrls: ['./verification.component.css']
})
export class AdminVerificationComponent implements OnInit {
  requests: any[] = [];
  total = 0;
  page = 1;
  pages = 1;
  limit = 20;
  filterStatus = '';
  isLoading = false;

  constructor(private http: HttpClient, private translate: TranslateService) {}

  ngOnInit(): void {
    this.loadRequests();
  }

  loadRequests(): void {
    this.isLoading = true;
    const params: Record<string, any> = { page: this.page, limit: this.limit };
    if (this.filterStatus) params['status'] = this.filterStatus;

    const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    this.http.get(url + 'admin/verification-requests?' + query).subscribe({
      next: (res: any) => {
        this.requests = res.requests || res.data?.items || [];
        this.total = res.total || res.data?.total || 0;
        this.pages = Math.ceil(this.total / this.limit) || 1;
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; }
    });
  }

  approve(id: string): void {
    const note = prompt('Admin note (optional):') || '';
    this.http.put(url + `admin/verification-requests/${id}`, { action: 'approved', adminNote: note }).subscribe({
      next: () => this.loadRequests()
    });
  }

  reject(id: string): void {
    const note = prompt('Rejection reason (required):') || '';
    if (!note) return;
    this.http.put(url + `admin/verification-requests/${id}`, { action: 'rejected', adminNote: note }).subscribe({
      next: () => this.loadRequests()
    });
  }

  filterByStatus(status: string): void {
    this.filterStatus = status;
    this.page = 1;
    this.loadRequests();
  }

  nextPage(): void {
    if (this.page < this.pages) { this.page++; this.loadRequests(); }
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadRequests(); }
  }
}
