import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <router-outlet *ngIf="!auth.isLoggedIn"></router-outlet>
    <div class="app-shell" *ngIf="auth.isLoggedIn" [class.sidebar-open]="sidebarOpen">
      <div class="sidebar-overlay" *ngIf="sidebarOpen" (click)="sidebarOpen=false"></div>
      <aside class="sidebar" [class.open]="sidebarOpen">
        <div class="sidebar-head">
          <div class="um6p-logo"><div class="block">U</div><div class="block">M</div><div class="block">6</div><div class="block">P</div></div>
          <div class="logo-text"><h1>NETUPGRADE</h1><span>Cisco Switch Manager</span></div>
          <button class="sidebar-close" (click)="sidebarOpen=false"><span class="material-icons">close</span></button>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-label">Main</div>
          <a class="nav-link" routerLink="/dashboard" routerLinkActive="active" (click)="sidebarOpen=false"><span class="material-icons">grid_view</span> Dashboard</a>
          <a class="nav-link" routerLink="/switches" routerLinkActive="active" (click)="sidebarOpen=false"><span class="material-icons">dns</span> Switch Inventory</a>
          <a class="nav-link" routerLink="/firmware" routerLinkActive="active" (click)="sidebarOpen=false"><span class="material-icons">inventory_2</span> Firmware Catalog</a>
          <div class="nav-label">Operations</div>
          <a class="nav-link" routerLink="/upgrade" routerLinkActive="active" (click)="sidebarOpen=false"><span class="material-icons">system_update_alt</span> Upgrade Center</a>
        </nav>
        <div class="sidebar-foot" style="flex-direction:column;align-items:stretch;gap:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="material-icons" style="font-size:18px;color:var(--um6p)">account_circle</span>
            <div>
              <div style="font-size:11px;font-weight:600;color:var(--t1)">{{auth.currentUser?.full_name}}</div>
              <div style="font-size:9px;color:var(--t3)">{{auth.currentUser?.role?.toUpperCase()}}</div>
            </div>
            <button (click)="auth.logout()" title="Logout" style="margin-left:auto;background:none;border:none;color:var(--t3);cursor:pointer;padding:4px;border-radius:4px">
              <span class="material-icons" style="font-size:18px">logout</span>
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:7px">
            <span class="dot-pulse"></span><span>System Operational</span><span class="um6p-foot-text" style="margin-left:auto">UM6P IT</span>
          </div>
        </div>
      </aside>
      <main class="main">
        <div class="mobile-bar">
          <button class="hamburger" (click)="sidebarOpen=true"><span class="material-icons">menu</span></button>
          <div class="um6p-logo" style="gap:2px"><div class="block" style="width:22px;height:22px;font-size:12px">U</div><div class="block" style="width:22px;height:22px;font-size:12px">M</div><div class="block" style="width:22px;height:22px;font-size:12px">6</div><div class="block" style="width:22px;height:22px;font-size:12px">P</div></div>
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px">NETUPGRADE</span>
          <button (click)="auth.logout()" style="margin-left:auto;background:none;border:none;color:var(--t3);cursor:pointer;padding:4px"><span class="material-icons" style="font-size:20px">logout</span></button>
        </div>
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent {
  sidebarOpen = false;
  constructor(public auth: AuthService) {}
}