import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CommunityHomeComponent } from './components/community-home/community-home.component';
import { CreatePostComponent } from './components/create-post/create-post.component';
import { PostDetailComponent } from './components/post-detail/post-detail.component';
import { CommunityProfileComponent } from './components/community-profile/community-profile.component';
import { CommunityAdminComponent } from './components/community-admin/community-admin.component';

const routes: Routes = [
  { path: '', component: CommunityHomeComponent },
  { path: 'create', component: CreatePostComponent },
  { path: 'profile', component: CommunityProfileComponent },
  { path: 'profile/:id', component: CommunityProfileComponent },
  { path: 'admin', component: CommunityAdminComponent },
  { path: 'post/:id', component: PostDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CommunityRoutingModule { }
