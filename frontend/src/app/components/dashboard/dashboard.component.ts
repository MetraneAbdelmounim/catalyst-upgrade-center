import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DashboardStats } from '../../models/interfaces';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-head">
      <div><h2>Dashboard</h2><p class="sub">UM6P Network Infrastructure Overview</p></div>
      <button class="btn btn-g" (click)="load()"><span class="material-icons">refresh</span> Refresh</button>
    </div>
    <div class="page-body" *ngIf="s">
      <div class="stat-row">
        <div class="stat c"><div class="stat-val">{{s.switches.total}}</div><div class="stat-lbl">Total Switches</div></div>
        <div class="stat g"><div class="stat-val">{{s.switches.online}}</div><div class="stat-lbl">Online</div></div>
        <div class="stat r"><div class="stat-val">{{s.switches.offline}}</div><div class="stat-lbl">Offline</div></div>
        <div class="stat i"><div class="stat-val">{{s.upgrades.total}}</div><div class="stat-lbl">Total Upgrades</div></div>
        <div class="stat g"><div class="stat-val">{{s.upgrades.success_rate}}%</div><div class="stat-lbl">Success Rate</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><span class="card-title">Version Distribution</span></div>
          <div *ngFor="let v of s.versions" class="bar-row">
            <div class="bar-lbl mono">{{v.version}}</div>
            <div class="bar-trk"><div class="bar-fl" [style.width.%]="vPct(v.count)"></div></div>
            <div class="bar-ct">{{v.count}}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">Sites</span></div>
          <div *ngFor="let st of s.sites" class="bar-row">
            <div class="bar-lbl">{{st.name}}</div>
            <div class="bar-trk"><div class="bar-fl g" [style.width.%]="sPct(st.count)"></div></div>
            <div class="bar-ct">{{st.count}}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Recent Upgrades</span>
          <a routerLink="/upgrade" class="btn btn-sm btn-g">View All</a>
        </div>
        <div class="tbl-wrap" *ngIf="s.recent_upgrades.length">
          <table>
            <thead><tr><th>Switch</th><th>IP</th><th>From</th><th>To</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              <tr *ngFor="let u of s.recent_upgrades">
                <td>{{u.switch_name}}</td>
                <td class="mono">{{u.switch_ip}}</td>
                <td class="mono">{{u.previous_version}}</td>
                <td class="mono">{{u.target_version}}</td>
                <td><span class="badge" [ngClass]="'b-'+u.status"><span class="dot"></span>{{u.status}}</span></td>
                <td class="t2 tsm">{{u.created_at | date:'short'}}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="empty" *ngIf="!s.recent_upgrades.length"><span class="material-icons">update</span><p>No upgrades yet</p></div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  s: DashboardStats | null = null;
  constructor(private api: ApiService) {}
  ngOnInit() { this.load(); }
  load() { this.api.getStats().subscribe(d => this.s = d); }
  vPct(c: number) { return this.s ? (c / this.s.switches.total * 100) : 0; }
  sPct(c: number) { return this.s ? (c / this.s.switches.total * 100) : 0; }
}
