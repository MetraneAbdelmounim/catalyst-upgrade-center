import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'switches', loadComponent: () => import('./components/switches/switches.component').then(m => m.SwitchesComponent), canActivate: [authGuard] },
  { path: 'firmware', loadComponent: () => import('./components/firmware/firmware.component').then(m => m.FirmwareComponent), canActivate: [authGuard] },
  { path: 'upgrade', loadComponent: () => import('./components/upgrade/upgrade.component').then(m => m.UpgradeComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' }
];