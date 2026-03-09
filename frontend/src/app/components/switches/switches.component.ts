import { Component, OnInit, NgZone } from '@angular/core';
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
        <button class="btn btn-g" (click)="showBulkImport=true"><span class="material-icons">upload_file</span> Bulk Import</button>
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
        <div style="margin-left:auto" *ngIf="selectedIds.length > 0">
          <button class="btn btn-d" (click)="deleteSelected()">
            <span class="material-icons">delete_sweep</span> Delete {{selectedIds.length}} selected
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th style="width:40px"><input type="checkbox" [checked]="allSelected" (change)="toggleSelectAll($event)"></th>
            <th>Name</th><th>IP Address</th><th>Model</th><th>Platform</th><th>Stack</th><th>Version</th><th>Site</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let sw of pagedSwitches" [style.background]="sw.selected?'var(--um6p-dim)':''">
              <td><input type="checkbox" [(ngModel)]="sw.selected" (change)="updateSelection()"></td>
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
      <!-- Pagination -->
      <div class="pagination" *ngIf="switches.length > 0">
        <div class="pg-info">{{(page-1)*pageSize+1}}–{{min(page*pageSize, switches.length)}} of {{switches.length}}</div>
        <div class="pg-controls">
          <div class="pg-size">
            <span>Show</span>
            <select [(ngModel)]="pageSize" (ngModelChange)="page=1">
              <option [value]="20">20</option><option [value]="50">50</option><option [value]="100">100</option>
            </select>
          </div>
          <button class="pg-btn" [disabled]="page<=1" (click)="page=1"><span class="material-icons" style="font-size:16px">first_page</span></button>
          <button class="pg-btn" [disabled]="page<=1" (click)="page=page-1"><span class="material-icons" style="font-size:16px">chevron_left</span></button>
          <span class="pg-info">{{page}} / {{totalPages}}</span>
          <button class="pg-btn" [disabled]="page>=totalPages" (click)="page=page+1"><span class="material-icons" style="font-size:16px">chevron_right</span></button>
          <button class="pg-btn" [disabled]="page>=totalPages" (click)="page=totalPages"><span class="material-icons" style="font-size:16px">last_page</span></button>
        </div>
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

      <!-- Bulk Import Modal -->
      <div class="modal-bg" *ngIf="showBulkImport" (click)="!discoveryRunning && (showBulkImport=false)">
        <div class="modal-box" (click)="$event.stopPropagation()" style="max-width:700px">
          <div class="modal-head">
            <h3>Bulk Import Switches</h3>
            <button class="modal-x" *ngIf="!discoveryRunning" (click)="closeBulkImport()"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">

            <!-- Upload Phase -->
            <div *ngIf="!discoveryRunning && !discoveryDone">
              <p class="t2 tsm mb-2">Upload an Excel file (.xlsx) with switch IPs and credentials. The app will auto-detect hostname, model, version, and serial via SSH.</p>

              <div class="between mb-2">
                <a [href]="templateUrl" class="btn btn-sm btn-g" download>
                  <span class="material-icons">download</span> Download Template
                </a>
              </div>

              <div style="border:2px dashed var(--border-1);border-radius:var(--r-lg);padding:30px;text-align:center;cursor:pointer;transition:.2s"
                   [style.borderColor]="dragOver?'var(--um6p)':'var(--border-1)'"
                   [style.background]="dragOver?'var(--um6p-dim)':'transparent'"
                   (click)="fileInput.click()"
                   (dragover)="$event.preventDefault();dragOver=true"
                   (dragleave)="dragOver=false"
                   (drop)="onDrop($event)">
                <span class="material-icons" style="font-size:36px;color:var(--t3);margin-bottom:8px">cloud_upload</span>
                <p class="t2 tsm">Drag & drop .xlsx file here or click to browse</p>
                <p class="mono tsm t3 mt-1" *ngIf="bulkFile">{{bulkFile.name}} ({{(bulkFile.size/1024).toFixed(0)}} KB)</p>
                <input #fileInput type="file" accept=".xlsx,.xls" style="display:none" (change)="onFileSelect($event)">
              </div>

              <div *ngIf="bulkResult?.error" class="mt-2" style="padding:14px;border-radius:var(--r-md);background:var(--red-d);border:1px solid var(--border-0)">
                <div style="color:var(--red)">{{bulkResult.error}}</div>
              </div>
            </div>

            <!-- Discovery Progress Phase -->
            <div *ngIf="discoveryRunning || discoveryDone">
              <!-- Overall progress bar -->
              <div class="between mb-1">
                <span class="t2 tsm" style="font-weight:600">
                  Auto-Discovery: {{discoveryData?.completed || 0}} / {{discoveryData?.total || 0}}
                </span>
                <span class="badge" [ngClass]="discoveryDone ? (discoveryData?.failed > 0 ? 'b-failed' : 'b-success') : 'b-running'">
                  {{discoveryDone ? 'Complete' : 'Running'}}
                </span>
              </div>
              <div style="height:6px;background:var(--bg-1);border-radius:3px;overflow:hidden;margin-bottom:14px">
                <div [style.width]="((discoveryData?.completed||0)/(discoveryData?.total||1)*100)+'%'"
                     [style.background]="discoveryDone?'var(--green)':'var(--um6p)'"
                     style="height:100%;border-radius:3px;transition:width .5s"></div>
              </div>
              <div class="between mb-2 tsm t2">
                <span style="color:var(--green)">{{discoveryData?.succeeded || 0}} succeeded</span>
                <span style="color:var(--red)" *ngIf="discoveryData?.failed > 0">{{discoveryData?.failed}} failed</span>
                <span *ngIf="discoveryRunning">{{(discoveryData?.total||0) - (discoveryData?.completed||0)}} remaining</span>
              </div>

              <!-- Per-switch list -->
              <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-0);border-radius:var(--r-md)">
                <div *ngFor="let sw of discoverySwitches"
                     style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-0)">
                  <span class="material-icons" style="font-size:18px"
                        [style.color]="sw.status==='success'?'var(--green)':sw.status==='failed'?'var(--red)':sw.status==='discovering'?'var(--um6p)':'var(--t3)'"
                        [class.spin]="sw.status==='discovering'">
                    {{sw.status==='success'?'check_circle':sw.status==='failed'?'error':sw.status==='discovering'?'sync':'schedule'}}
                  </span>
                  <span class="mono tsm" style="min-width:120px">{{sw.ip}}</span>
                  <span class="tsm t2" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{sw.detail || '—'}}</span>
                </div>
              </div>
            </div>

          </div>
          <div class="modal-foot">
            <button class="btn btn-g" *ngIf="discoveryDone" (click)="closeBulkImport()">Close</button>
            <button class="btn btn-g" *ngIf="!discoveryRunning && !discoveryDone" (click)="closeBulkImport()">Cancel</button>
            <button class="btn btn-p" *ngIf="!discoveryRunning && !discoveryDone" (click)="uploadBulk()" [disabled]="!bulkFile || bulkUploading">
              <span class="material-icons">{{bulkUploading?'sync':'upload'}}</span>
              {{bulkUploading?'Importing…':'Import Switches'}}
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
  showModal = false; showDiscover = false; showBulkImport = false; editing = false;
  form: Partial<Switch> = {};
  editId = '';
  discoverIp = ''; discoverUser = 'admin'; discoverPass = '';
  discovered: any = null;
  checking = false;

  // Bulk import
  bulkFile: File | null = null;
  bulkResult: any = null;
  bulkUploading = false;
  dragOver = false;
  templateUrl = '';

  // Discovery tracking
  discoveryRunning = false;
  discoveryDone = false;
  discoveryData: any = null;
  discoverySwitches: any[] = [];
  private discoveryEs: EventSource | null = null;

  // Multi-select
  selectedIds: string[] = [];
  allSelected = false;

  // Pagination
  page = 1;
  pageSize: number = 20;

  get totalPages(): number { return Math.max(1, Math.ceil(this.switches.length / this.pageSize)); }
  get pagedSwitches(): Switch[] {
    const start = (this.page - 1) * this.pageSize;
    return this.switches.slice(start, start + +this.pageSize);
  }
  min(a: number, b: number) { return Math.min(a, b); }

  constructor(private api: ApiService, private zone: NgZone) {}
  ngOnInit() {
    this.load();
    this.templateUrl = this.api.getTemplate();
  }

  load() {
    this.api.getSwitches({ search: this.search, status: this.filterStatus, platform: this.filterPlatform })
      .subscribe(d => this.switches = d);
  }

  // Bulk Import methods
  onFileSelect(event: any) {
    this.bulkFile = event.target.files[0] || null;
    this.bulkResult = null;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      this.bulkFile = file;
      this.bulkResult = null;
    }
  }

  uploadBulk() {
    if (!this.bulkFile) return;
    this.bulkUploading = true;
    this.bulkResult = null;
    this.api.bulkImport(this.bulkFile).subscribe({
      next: (res) => {
        this.bulkResult = res;
        this.bulkUploading = false;
        this.bulkFile = null;
        this.load();

        // Start discovery progress tracking
        if (res.discovery_id && res.imported > 0) {
          this.discoveryRunning = true;
          this.discoveryDone = false;
          this.discoveryData = null;
          this.discoverySwitches = [];

          this.discoveryEs = this.api.discoveryProgress(res.discovery_id);
          this.discoveryEs.onmessage = (event) => {
            this.zone.run(() => {
              const data = JSON.parse(event.data);
              if (data.status === 'not_found') { this.discoveryEs?.close(); return; }

              this.discoveryData = data;
              if (data.switches) {
                this.discoverySwitches = Object.values(data.switches).sort((a: any, b: any) => {
                  const order: any = { discovering: 0, pending: 1, success: 2, failed: 3 };
                  return (order[a.status] ?? 4) - (order[b.status] ?? 4);
                });
              }

              if (data.status === 'complete') {
                this.discoveryRunning = false;
                this.discoveryDone = true;
                this.discoveryEs?.close();
                this.load();
              }
            });
          };
          this.discoveryEs.onerror = () => {
            this.zone.run(() => {
              this.discoveryEs?.close();
              this.discoveryRunning = false;
              this.discoveryDone = true;
              this.load();
            });
          };
        }
      },
      error: (err) => {
        this.bulkResult = { error: err.error?.error || 'Upload failed' };
        this.bulkUploading = false;
      }
    });
  }

  closeBulkImport() {
    this.showBulkImport = false;
    this.discoveryRunning = false;
    this.discoveryDone = false;
    this.discoveryData = null;
    this.discoverySwitches = [];
    this.bulkFile = null;
    this.bulkResult = null;
    if (this.discoveryEs) { this.discoveryEs.close(); this.discoveryEs = null; }
    this.load();
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

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    this.switches.forEach(s => s.selected = checked);
    this.updateSelection();
  }

  updateSelection() {
    this.selectedIds = this.switches.filter(s => s.selected).map(s => s._id!);
    this.allSelected = this.switches.length > 0 && this.switches.every(s => s.selected);
  }

  deleteSelected() {
    if (!this.selectedIds.length) return;
    if (!confirm(`Delete ${this.selectedIds.length} switch(es)? This cannot be undone.`)) return;
    this.api.bulkDelete(this.selectedIds).subscribe(() => {
      this.selectedIds = [];
      this.allSelected = false;
      this.load();
    });
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