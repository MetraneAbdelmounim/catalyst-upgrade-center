import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'switches', loadComponent: () => import('./components/switches/switches.component').then(m => m.SwitchesComponent) },
  { path: 'firmware', loadComponent: () => import('./components/firmware/firmware.component').then(m => m.FirmwareComponent) },
  { path: 'upgrade', loadComponent: () => import('./components/upgrade/upgrade.component').then(m => m.UpgradeComponent) },
  { path: '**', redirectTo: 'dashboard' }
];
