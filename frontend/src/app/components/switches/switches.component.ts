import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Switch } from '../../models/interfaces';

@Component({
  selector: 'app-switches',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div><h2>Switch Inventory</h2><p class="sub">Manage your Cisco switch fleet</p></div>
      <div class="gap-r">
        <button class="btn btn-g" (click)="checkAll()" [disabled]="checking">
          <span class="material-icons">{{checking ? 'sync' : 'network_check'}}</span> {{checking ? 'Checking…' : 'Check Status'}}
        </button>
        <button class="btn btn-g" (click)="showDiscover=true"><span class="material-icons">search</span> Discover</button>
        <button class="btn btn-p" (click)="openAdd()"><span class="material-icons">add</span> Add Switch</button>
      </div>
    </div>
    <div class="page-body">
      <!-- Filters -->
      <div class="gap-r mb-2">
        <input class="fc" style="max-width:280px" placeholder="Search name, IP, model…" [(ngModel)]="search" (ngModelChange)="load()">
        <select class="fc" style="max-width:150px" [(ngModel)]="filterStatus" (ngModelChange)="load()">
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="upgrading">Upgrading</option>
        </select>
        <select class="fc" style="max-width:150px" [(ngModel)]="filterPlatform" (ngModelChange)="load()">
          <option value="">All Platforms</option>
          <option value="IOS-XE">IOS-XE</option>
          <option value="NX-OS">NX-OS</option>
          <option value="IOS">IOS</option>
        </select>
      </div>

      <!-- Table -->
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>IP Address</th><th>Model</th><th>Platform</th><th>Stack</th><th>Version</th><th>Site</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let sw of switches">
              <td style="font-weight:600">{{sw.name}}</td>
              <td class="mono">{{sw.ip_address}}</td>
              <td class="mono tsm">{{sw.model}}</td>
              <td><span class="badge b-running" style="font-size:10px">{{sw.platform}}</span></td>
              <td>
                <span *ngIf="sw.is_stack" class="badge" style="background:var(--indigo-d);color:var(--indigo);font-size:10px">
                  STACK ×{{sw.stack_count}}
                </span>
                <span *ngIf="!sw.is_stack" class="t3 tsm">Single</span>
              </td>
              <td class="mono">{{sw.current_version}}</td>
              <td class="t2">{{sw.site}}</td>
              <td><span class="badge" [ngClass]="'b-'+sw.status"><span class="dot"></span>{{sw.status}}</span></td>
              <td>
                <div class="gap-r">
                  <button class="btn btn-sm btn-g" (click)="checkOne(sw)" title="Ping check"><span class="material-icons">network_check</span></button>
                  <button class="btn btn-sm btn-g" (click)="openEdit(sw)"><span class="material-icons">edit</span></button>
                  <button class="btn btn-sm btn-d" (click)="del(sw)"><span class="material-icons">delete</span></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" *ngIf="switches.length===0"><span class="material-icons">dns</span><p>No switches found</p></div>

      <!-- Add/Edit Modal -->
      <div class="modal-bg" *ngIf="showModal" (click)="showModal=false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3>{{editing?'Edit':'Add'}} Switch</h3>
            <button class="modal-x" (click)="showModal=false"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <div class="fg"><label>Name *</label><input class="fc" [(ngModel)]="form.name" placeholder="CORE-SW-01"></div>
              <div class="fg"><label>IP Address *</label><input class="fc" [(ngModel)]="form.ip_address" placeholder="10.0.1.1"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Model</label><input class="fc" [(ngModel)]="form.model" placeholder="C9300-48P"></div>
              <div class="fg"><label>Platform</label>
                <select class="fc" [(ngModel)]="form.platform">
                  <option value="IOS-XE">IOS-XE</option><option value="NX-OS">NX-OS</option><option value="IOS">IOS</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Current Version</label><input class="fc" [(ngModel)]="form.current_version" placeholder="17.09.05"></div>
              <div class="fg"><label>Serial Number</label><input class="fc" [(ngModel)]="form.serial_number"></div>
            </div>
            <div class="fg"><label>Site</label><input class="fc" [(ngModel)]="form.site" placeholder="HQ-DataCenter"></div>
            <div class="form-row">
              <div class="fg"><label>SSH Username</label><input class="fc" [(ngModel)]="form.ssh_username" placeholder="admin"></div>
              <div class="fg"><label>SSH Password</label><input class="fc" type="password" [(ngModel)]="form.ssh_password"></div>
            </div>
            <div class="fg"><label>Enable Password</label><input class="fc" type="password" [(ngModel)]="form.enable_password"></div>
            <div class="form-row">
              <div class="fg" style="display:flex;align-items:flex-end;padding-bottom:14px">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                  <input type="checkbox" [(ngModel)]="form.is_stack"> This is a StackWise stack
                </label>
              </div>
              <div class="fg" *ngIf="form.is_stack">
                <label>Stack Members Count</label>
                <input class="fc" type="number" [(ngModel)]="form.stack_count" min="2" max="8" placeholder="2">
              </div>
            </div>
            <div class="fg"><label>Notes</label><textarea class="fc" rows="2" [(ngModel)]="form.notes"></textarea></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showModal=false">Cancel</button>
            <button class="btn btn-p" (click)="save()" [disabled]="!form.name||!form.ip_address">
              {{editing?'Update':'Add Switch'}}
            </button>
          </div>
        </div>
      </div>

      <!-- Discover Modal -->
      <div class="modal-bg" *ngIf="showDiscover" (click)="showDiscover=false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3>Discover Switch</h3>
            <button class="modal-x" (click)="showDiscover=false"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <p class="t2 tsm mb-2">Enter an IP address to auto-detect switch details via SSH.</p>
            <div class="fg"><label>IP Address *</label><input class="fc" [(ngModel)]="discoverIp" placeholder="10.0.1.5"></div>
            <div class="form-row">
              <div class="fg"><label>SSH Username</label><input class="fc" [(ngModel)]="discoverUser" placeholder="admin"></div>
              <div class="fg"><label>SSH Password</label><input class="fc" type="password" [(ngModel)]="discoverPass"></div>
            </div>
            <div *ngIf="discovered" class="card mt-2" style="background:var(--bg-0)">
              <p class="tsm" style="margin-bottom:8px;font-weight:600;color:var(--green)">Switch Discovered!</p>
              <div class="tsm t2">{{discovered.name}} — {{discovered.model}} — {{discovered.platform}} — v{{discovered.current_version}}</div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showDiscover=false">Cancel</button>
            <button class="btn btn-p" *ngIf="!discovered" (click)="discover()" [disabled]="!discoverIp">
              <span class="material-icons">search</span> Discover
            </button>
            <button class="btn btn-s" *ngIf="discovered" (click)="addDiscovered()">
              <span class="material-icons">add</span> Add to Inventory
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class SwitchesComponent implements OnInit {
  switches: Switch[] = [];
  search = ''; filterStatus = ''; filterPlatform = '';
  showModal = false; showDiscover = false; editing = false;
  form: Partial<Switch> = {};
  editId = '';
  discoverIp = ''; discoverUser = 'admin'; discoverPass = '';
  discovered: any = null;
  checking = false;

  constructor(private api: ApiService) {}
  ngOnInit() { this.load(); }

  load() {
    this.api.getSwitches({ search: this.search, status: this.filterStatus, platform: this.filterPlatform })
      .subscribe(d => this.switches = d);
  }

  checkAll() {
    this.checking = true;
    this.api.checkAllSwitches().subscribe({
      next: () => { this.checking = false; this.load(); },
      error: () => { this.checking = false; }
    });
  }

  checkOne(sw: Switch) {
    this.api.checkSwitch(sw._id!).subscribe(() => this.load());
  }

  openAdd() {
    this.editing = false; this.editId = '';
    this.form = { platform: 'IOS-XE', ssh_username: 'admin', status: 'unknown' };
    this.showModal = true;
  }

  openEdit(sw: Switch) {
    this.editing = true; this.editId = sw._id!;
    this.form = { ...sw };
    this.showModal = true;
  }

  save() {
    const obs = this.editing
      ? this.api.updateSwitch(this.editId, this.form)
      : this.api.addSwitch(this.form);
    obs.subscribe(() => { this.showModal = false; this.load(); });
  }

  del(sw: Switch) {
    if (confirm(`Delete ${sw.name} (${sw.ip_address})?`))
      this.api.deleteSwitch(sw._id!).subscribe(() => this.load());
  }

  discover() {
    this.discovered = null;
    this.api.discoverSwitch({ ip_address: this.discoverIp, ssh_username: this.discoverUser, ssh_password: this.discoverPass })
      .subscribe(d => this.discovered = d);
  }

  addDiscovered() {
    if (!this.discovered) return;
    this.discovered.ssh_password = this.discoverPass;
    this.api.addSwitch(this.discovered).subscribe(() => {
      this.showDiscover = false; this.discovered = null; this.load();
    });
  }
}
