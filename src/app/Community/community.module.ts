import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';

import { CommunityRoutingModule } from './community-routing.module';
import { SharedModule } from '../shared/shared.module';

import { CommunityHeroComponent } from './components/community-hero/community-hero.component';
import { LeftSidebarComponent } from './components/left-sidebar/left-sidebar.component';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar.component';
import { PostCardComponent } from './components/post-card/post-card.component';
import { CommunityHomeComponent } from './components/community-home/community-home.component';
import { CreatePostComponent } from './components/create-post/create-post.component';
import { CommunityProfileComponent } from './components/community-profile/community-profile.component';
import { PostDetailComponent } from './components/post-detail/post-detail.component';
import { CommentItemComponent } from './components/comment-item/comment-item.component';
import { CommunityAdminComponent } from './components/community-admin/community-admin.component';
import { NotificationBellComponent } from './components/notification-bell/notification-bell.component';
import { ShareMenuComponent } from './components/share-menu/share-menu.component';
import { TimeAgoPipe } from './pipes/time-ago.pipe';

@NgModule({
  declarations: [
    CommunityHeroComponent,
    LeftSidebarComponent,
    RightSidebarComponent,
    PostCardComponent,
    CommunityHomeComponent,
    CreatePostComponent,
    CommunityProfileComponent,
    PostDetailComponent,
    CommentItemComponent,
    CommunityAdminComponent,
    NotificationBellComponent,
    ShareMenuComponent,
    TimeAgoPipe
  ],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule.forChild(),
    CommunityRoutingModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    SharedModule
  ],
  providers: [provideNativeDateAdapter()]
})
export class CommunityModule { }
