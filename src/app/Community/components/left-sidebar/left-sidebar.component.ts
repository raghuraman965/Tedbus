import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Category } from '../../models/community.model';
import { CommunityDataService } from '../../services/community-data.service';
import { AuthService } from '../../../Premium/services/auth.service';

@Component({
  selector: 'app-left-sidebar',
  templateUrl: './left-sidebar.component.html',
  styleUrls: ['./left-sidebar.component.css']
})
export class LeftSidebarComponent {
  @Input() activeCategory: string = '';
  @Output() categorySelected = new EventEmitter<string>();

  categories: Category[] = [];

  constructor(
    private communityData: CommunityDataService,
    private authService: AuthService,
    private router: Router
  ) {
    this.categories = this.communityData.getCategories();
  }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }

  get isAdmin(): boolean {
    return this.communityData.isCurrentUserAdmin;
  }

  categoryKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_');
  }

  select(name: string): void {
    this.categorySelected.emit(this.activeCategory === name ? '' : name);
  }

  goToHome(): void {
    this.router.navigate(['/community']);
  }

  goToCreatePost(): void {
    this.router.navigate(['/community/create']);
  }

  goToProfile(): void {
    this.router.navigate(['/community/profile']);
  }

  goToAdmin(): void {
    this.router.navigate(['/community/admin']);
  }
}
