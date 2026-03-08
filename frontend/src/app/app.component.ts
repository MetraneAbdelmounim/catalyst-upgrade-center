import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
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
        </div>
        <nav class="sidebar-nav">
          <div class="nav-label">Main</div>
          <a class="nav-link" routerLink="/dashboard" routerLinkActive="active">
            <span class="material-icons">grid_view</span> Dashboard
          </a>
          <a class="nav-link" routerLink="/switches" routerLinkActive="active">
            <span class="material-icons">dns</span> Switch Inventory
          </a>
          <a class="nav-link" routerLink="/firmware" routerLinkActive="active">
            <span class="material-icons">inventory_2</span> Firmware Catalog
          </a>
          <div class="nav-label">Operations</div>
          <a class="nav-link" routerLink="/upgrade" routerLinkActive="active">
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
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent {}
