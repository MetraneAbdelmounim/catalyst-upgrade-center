import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="app-shell" [class.sidebar-open]="sidebarOpen">
      <!-- Mobile overlay -->
      <div class="sidebar-overlay" *ngIf="sidebarOpen" (click)="sidebarOpen=false"></div>

      <aside class="sidebar" [class.open]="sidebarOpen">
        <div class="sidebar-head">
          <div class="um6p-logo">
            <div class="block">U</div>
            <div class="block">M</div>
            <div class="block">6</div>
            <div class="block">P</div>
          </div>
          <div class="logo-text">
            <h1>NETUPGRADE</h1>
            <span>Cisco Switch Manager</span>
          </div>
          <button class="sidebar-close" (click)="sidebarOpen=false">
            <span class="material-icons">close</span>
          </button>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-label">Main</div>
          <a class="nav-link" routerLink="/dashboard" routerLinkActive="active" (click)="sidebarOpen=false">
            <span class="material-icons">grid_view</span> Dashboard
          </a>
          <a class="nav-link" routerLink="/switches" routerLinkActive="active" (click)="sidebarOpen=false">
            <span class="material-icons">dns</span> Switch Inventory
          </a>
          <a class="nav-link" routerLink="/firmware" routerLinkActive="active" (click)="sidebarOpen=false">
            <span class="material-icons">inventory_2</span> Firmware Catalog
          </a>
          <div class="nav-label">Operations</div>
          <a class="nav-link" routerLink="/upgrade" routerLinkActive="active" (click)="sidebarOpen=false">
            <span class="material-icons">system_update_alt</span> Upgrade Center
          </a>
        </nav>
        <div class="sidebar-foot">
          <span class="dot-pulse"></span>
          <span>System Operational</span>
          <span class="um6p-foot-text" style="margin-left:auto">UM6P IT</span>
        </div>
      </aside>
      <main class="main">
        <!-- Mobile header bar -->
        <div class="mobile-bar">
          <button class="hamburger" (click)="sidebarOpen=true">
            <span class="material-icons">menu</span>
          </button>
          <div class="um6p-logo" style="gap:2px">
            <div class="block" style="width:22px;height:22px;font-size:12px">U</div>
            <div class="block" style="width:22px;height:22px;font-size:12px">M</div>
            <div class="block" style="width:22px;height:22px;font-size:12px">6</div>
            <div class="block" style="width:22px;height:22px;font-size:12px">P</div>
          </div>
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px">NETUPGRADE</span>
        </div>
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent {
  sidebarOpen = false;
}