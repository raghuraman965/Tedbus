import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-coming-soon-page',
  templateUrl: './coming-soon-page.component.html',
  styleUrls: ['./coming-soon-page.component.css']
})
export class ComingSoonPageComponent implements OnInit {
  service: 'cab' | 'train' = 'cab';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.service = this.route.snapshot.data['service'] === 'train' ? 'train' : 'cab';
  }
}
