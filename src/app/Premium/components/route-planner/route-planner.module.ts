import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../../../shared/shared.module';

import { RoutePlannerComponent } from './route-planner.component';

const routes: Routes = [{ path: '', component: RoutePlannerComponent }];

@NgModule({
  declarations: [RoutePlannerComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    TranslateModule.forChild(),
    SharedModule
  ]
})
export class RoutePlannerModule { }
