import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CommunityDataService } from '../../services/community-data.service';
import { Hashtag } from '../../models/community.model';

@Component({
  selector: 'app-community-hero',
  templateUrl: './community-hero.component.html',
  styleUrls: ['./community-hero.component.css']
})
export class CommunityHeroComponent implements OnInit {
  @Output() search = new EventEmitter<string>();

  searchTerm: string = '';
  trendingTopics: string[] = [];

  constructor(private router: Router, private communityData: CommunityDataService) { }

  ngOnInit(): void {
    // Real hashtags aggregated from actual posts — empty until real activity exists.
    this.communityData.getTrendingHashtags().subscribe({
      next: (hashtags: Hashtag[]) => {
        this.trendingTopics = hashtags.slice(0, 6).map((h) => '#' + h.name);
      },
      error: () => this.trendingTopics = []
    });
  }

  onSearch(): void {
    this.search.emit(this.searchTerm);
  }

  selectTopic(topic: string): void {
    this.searchTerm = topic.replace('#', '');
    this.onSearch();
  }

  goToCreatePost(): void {
    this.router.navigate(['/community/create']);
  }
}
