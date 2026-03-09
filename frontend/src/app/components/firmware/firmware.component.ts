import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Firmware } from '../../models/interfaces';

@Component({
  selector: 'app-firmware',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div><h2>Firmware Catalog</h2><p class="sub">Available IOS-XE, NX-OS, and IOS images</p></div>
      <div class="gap-r">
        <button class="btn btn-g" (click)="scanDir()"><span class="material-icons">folder_open</span> Scan Directory</button>
        <button class="btn btn-p" (click)="showAdd=true"><span class="material-icons">add</span> Add Firmware</button>
      </div>
    </div>
    <div class="page-body">
      <div class="gap-r mb-2">
        <select class="fc" style="max-width:160px" [(ngModel)]="filterPlatform" (ngModelChange)="load()">
          <option value="">All Platforms</option>
          <option value="IOS-XE">IOS-XE</option><option value="NX-OS">NX-OS</option><option value="IOS">IOS</option>
        </select>
        <select class="fc" style="max-width:200px" [(ngModel)]="filterFamily" (ngModelChange)="load()">
          <option value="">All Models</option>
          <option *ngFor="let f of families" [value]="f">{{f}}</option>
        </select>
      </div>

      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Platform</th><th>Model Family</th><th>Version</th><th>Filename</th><th>Size</th><th>MD5</th><th></th><th>Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let fw of pagedFirmware">
              <td><span class="badge b-running" style="font-size:10px">{{fw.platform}}</span></td>
              <td>{{fw.model_family}}</td>
              <td class="mono" style="font-weight:600">{{fw.version}}</td>
              <td class="mono tsm t2">{{fw.filename}}</td>
              <td class="mono tsm">{{formatSize(fw.file_size)}}</td>
              <td class="mono tsm t3" style="max-width:100px;overflow:hidden;text-overflow:ellipsis">{{fw.md5_hash || '—'}}</td>
              <td><span class="b-rec" *ngIf="fw.is_recommended">Recommended</span></td>
              <td><button class="btn btn-sm btn-d" (click)="del(fw)"><span class="material-icons">delete</span></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- Pagination -->
      <div class="pagination" *ngIf="firmware.length > 0">
        <div class="pg-info">{{(fwPage-1)*fwPageSize+1}}–{{min(fwPage*fwPageSize, firmware.length)}} of {{firmware.length}}</div>
        <div class="pg-controls">
          <div class="pg-size">
            <span>Show</span>
            <select [(ngModel)]="fwPageSize" (ngModelChange)="fwPage=1">
              <option [value]="20">20</option><option [value]="50">50</option><option [value]="100">100</option>
            </select>
          </div>
          <button class="pg-btn" [disabled]="fwPage<=1" (click)="fwPage=1"><span class="material-icons" style="font-size:16px">first_page</span></button>
          <button class="pg-btn" [disabled]="fwPage<=1" (click)="fwPage=fwPage-1"><span class="material-icons" style="font-size:16px">chevron_left</span></button>
          <span class="pg-info">{{fwPage}} / {{fwTotalPages}}</span>
          <button class="pg-btn" [disabled]="fwPage>=fwTotalPages" (click)="fwPage=fwPage+1"><span class="material-icons" style="font-size:16px">chevron_right</span></button>
          <button class="pg-btn" [disabled]="fwPage>=fwTotalPages" (click)="fwPage=fwTotalPages"><span class="material-icons" style="font-size:16px">last_page</span></button>
        </div>
      </div>

      <!-- Add Modal with auto-detect -->
      <div class="modal-bg" *ngIf="showAdd" (click)="showAdd=false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-head"><h3>Add Firmware</h3><button class="modal-x" (click)="showAdd=false"><span class="material-icons">close</span></button></div>
          <div class="modal-body">
            <div class="fg">
              <label>Filename * <span class="t3 tsm">(type or paste — fields auto-fill)</span></label>
              <input class="fc" [(ngModel)]="form.filename" placeholder="cat9k_lite_iosxe.17.15.04.SPA.bin" (ngModelChange)="onFilenameChange($event)">
            </div>
            <div *ngIf="detecting" class="tsm t2 mb-2" style="display:flex;align-items:center;gap:6px">
              <span class="material-icons spin" style="font-size:14px;color:var(--um6p)">sync</span> Auto-detecting…
            </div>
            <div class="form-row">
              <div class="fg"><label>Platform *</label>
                <select class="fc" [(ngModel)]="form.platform"><option value="IOS-XE">IOS-XE</option><option value="NX-OS">NX-OS</option><option value="IOS">IOS</option></select>
              </div>
              <div class="fg"><label>Model Family *</label><input class="fc" [(ngModel)]="form.model_family" placeholder="Catalyst 9300"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Version *</label><input class="fc" [(ngModel)]="form.version" placeholder="17.12.04"></div>
              <div class="fg"><label>File Size (bytes)</label><input class="fc" type="number" [(ngModel)]="form.file_size"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>MD5 Hash</label><input class="fc" [(ngModel)]="form.md5_hash" placeholder="Auto-computed if file in firmware dir"></div>
              <div class="fg"><label>Release Date</label><input class="fc" type="date" [(ngModel)]="form.release_date"></div>
            </div>
            <div class="fg" style="display:flex;align-items:center;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0">
                <input type="checkbox" [(ngModel)]="form.is_recommended"> Recommended
              </label>
            </div>
            <div class="fg"><label>Release Notes</label><textarea class="fc" rows="2" [(ngModel)]="form.release_notes"></textarea></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showAdd=false">Cancel</button>
            <button class="btn btn-p" (click)="add()" [disabled]="!form.platform||!form.version||!form.filename">Add Firmware</button>
          </div>
        </div>
      </div>

      <!-- Scan Directory Modal -->
      <div class="modal-bg" *ngIf="showScan" (click)="showScan=false">
        <div class="modal-box" (click)="$event.stopPropagation()" style="max-width:750px">
          <div class="modal-head">
            <h3>Scan Firmware Directory</h3>
            <button class="modal-x" (click)="showScan=false"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <div *ngIf="scanning" style="text-align:center;padding:20px">
              <span class="material-icons spin" style="font-size:28px;color:var(--um6p)">sync</span>
              <p class="t2 tsm mt-1">Scanning firmware directory…</p>
            </div>

            <div *ngIf="!scanning && scanResult">
              <p class="tsm t2 mb-2">Directory: <span class="mono">{{scanResult.directory}}</span></p>
              <p class="mb-2">Found <strong>{{scanResult.total_files}}</strong> firmware files, <strong style="color:var(--green)">{{scanResult.new_files}}</strong> new</p>

              <div *ngIf="scanResult.files.length" style="max-height:350px;overflow-y:auto;border:1px solid var(--border-0);border-radius:var(--r-md)">
                <div *ngFor="let f of scanResult.files"
                     style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border-0);font-size:12px">
                  <input type="checkbox" [(ngModel)]="f.selected" [disabled]="f.already_in_db">
                  <div style="flex:1;min-width:0">
                    <div class="mono" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{f.filename}}</div>
                    <div class="t2 tsm">{{f.platform}} · {{f.model_family || '?'}} · v{{f.version || '?'}} · {{formatSize(f.file_size)}}</div>
                  </div>
                  <span *ngIf="f.already_in_db" class="badge b-success" style="font-size:9px;flex-shrink:0">In DB</span>
                  <span *ngIf="!f.already_in_db && !f.selected" class="badge b-pending" style="font-size:9px;flex-shrink:0">New</span>
                </div>
              </div>
              <div *ngIf="!scanResult.files.length" class="empty"><p>No .bin files found in directory</p></div>

              <div *ngIf="scanImported" class="mt-2" style="color:var(--green);font-weight:600">
                {{scanImported}} firmware image(s) imported!
              </div>
            </div>
          </div>
          <div class="modal-foot" *ngIf="!scanning && scanResult">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2);margin-right:auto;cursor:pointer">
              <input type="checkbox" [(ngModel)]="scanComputeMd5"> Compute MD5 (slow for large files)
            </label>
            <button class="btn btn-g" (click)="showScan=false">Close</button>
            <button class="btn btn-p" (click)="importScanned()" [disabled]="!scanHasSelected()">
              <span class="material-icons">add</span> Import Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class FirmwareComponent implements OnInit {
  firmware: Firmware[] = [];
  families: string[] = [];
  filterPlatform = ''; filterFamily = '';
  showAdd = false;
  form: any = { platform: 'IOS-XE', is_recommended: false };
  detecting = false;
  private detectTimer: any;

  // Pagination
  fwPage = 1;
  fwPageSize: number = 20;
  get fwTotalPages(): number { return Math.max(1, Math.ceil(this.firmware.length / this.fwPageSize)); }
  get pagedFirmware(): Firmware[] {
    const s = (this.fwPage - 1) * this.fwPageSize;
    return this.firmware.slice(s, s + +this.fwPageSize);
  }
  min(a: number, b: number) { return Math.min(a, b); }

  // Scan
  showScan = false;
  scanning = false;
  scanResult: any = null;
  scanComputeMd5 = false;
  scanImported: number | null = null;

  constructor(private api: ApiService) {}
  ngOnInit() { this.load(); this.loadFamilies(); }

  load() { this.api.getFirmware({ platform: this.filterPlatform, model_family: this.filterFamily }).subscribe(d => this.firmware = d); }
  loadFamilies() { this.api.getFirmware().subscribe(d => { this.families = [...new Set(d.map(f => f.model_family))]; }); }

  formatSize(b: number): string {
    if (!b) return '—';
    if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
    return (b / 1e6).toFixed(0) + ' MB';
  }

  // Auto-detect from filename with debounce
  onFilenameChange(filename: string) {
    clearTimeout(this.detectTimer);
    if (!filename || filename.length < 5) return;
    this.detectTimer = setTimeout(() => {
      this.detecting = true;
      this.api.detectFirmware(filename).subscribe({
        next: (res) => {
          this.detecting = false;
          if (res.platform) this.form.platform = res.platform;
          if (res.model_family) this.form.model_family = res.model_family;
          if (res.version) this.form.version = res.version;
          if (res.file_size) this.form.file_size = res.file_size;
        },
        error: () => { this.detecting = false; }
      });
    }, 500);
  }

  add() {
    this.api.addFirmware(this.form).subscribe(() => {
      this.showAdd = false;
      this.form = { platform: 'IOS-XE', is_recommended: false };
      this.load(); this.loadFamilies();
    });
  }

  del(fw: Firmware) {
    if (confirm(`Delete firmware ${fw.version}?`))
      this.api.deleteFirmware(fw._id!).subscribe(() => this.load());
  }

  // Scan firmware directory
  scanDir() {
    this.showScan = true;
    this.scanning = true;
    this.scanResult = null;
    this.scanImported = null;
    this.api.scanFirmware().subscribe({
      next: (res) => {
        this.scanning = false;
        this.scanResult = res;
        // Pre-select new files
        if (res.files) {
          res.files.forEach((f: any) => f.selected = !f.already_in_db);
        }
      },
      error: (err) => {
        this.scanning = false;
        this.scanResult = { files: [], error: err.error?.error || 'Scan failed' };
      }
    });
  }

  scanHasSelected(): boolean {
    return this.scanResult?.files?.some((f: any) => f.selected) || false;
  }

  importScanned() {
    const selected = this.scanResult.files.filter((f: any) => f.selected);
    this.api.importScanned(selected, this.scanComputeMd5).subscribe({
      next: (res) => {
        this.scanImported = res.imported;
        this.load(); this.loadFamilies();
        // Update "In DB" status
        if (this.scanResult?.files) {
          selected.forEach((f: any) => { f.already_in_db = true; f.selected = false; });
          this.scanResult.new_files = this.scanResult.files.filter((f: any) => !f.already_in_db).length;
        }
      }
    });
  }
}