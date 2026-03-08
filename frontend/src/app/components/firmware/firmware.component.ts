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
      <button class="btn btn-p" (click)="showAdd=true"><span class="material-icons">add</span> Add Firmware</button>
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
          <thead><tr><th>Platform</th><th>Model Family</th><th>Version</th><th>Filename</th><th>Size</th><th>Release</th><th></th><th>Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let fw of firmware">
              <td><span class="badge b-running" style="font-size:10px">{{fw.platform}}</span></td>
              <td>{{fw.model_family}}</td>
              <td class="mono" style="font-weight:600">{{fw.version}}</td>
              <td class="mono tsm t2">{{fw.filename}}</td>
              <td class="mono tsm">{{formatSize(fw.file_size)}}</td>
              <td class="tsm t2">{{fw.release_date | date:'mediumDate'}}</td>
              <td><span class="b-rec" *ngIf="fw.is_recommended">Recommended</span></td>
              <td><button class="btn btn-sm btn-d" (click)="del(fw)"><span class="material-icons">delete</span></button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add Modal -->
      <div class="modal-bg" *ngIf="showAdd" (click)="showAdd=false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-head"><h3>Add Firmware</h3><button class="modal-x" (click)="showAdd=false"><span class="material-icons">close</span></button></div>
          <div class="modal-body">
            <div class="form-row">
              <div class="fg"><label>Platform *</label>
                <select class="fc" [(ngModel)]="form.platform"><option value="IOS-XE">IOS-XE</option><option value="NX-OS">NX-OS</option><option value="IOS">IOS</option></select>
              </div>
              <div class="fg"><label>Model Family *</label><input class="fc" [(ngModel)]="form.model_family" placeholder="Catalyst 9300"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Version *</label><input class="fc" [(ngModel)]="form.version" placeholder="17.12.04"></div>
              <div class="fg"><label>Filename *</label><input class="fc" [(ngModel)]="form.filename" placeholder="cat9k_iosxe.17.12.04.SPA.bin"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>File Size (bytes)</label><input class="fc" type="number" [(ngModel)]="form.file_size"></div>
              <div class="fg"><label>MD5 Hash</label><input class="fc" [(ngModel)]="form.md5_hash"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Release Date</label><input class="fc" type="date" [(ngModel)]="form.release_date"></div>
              <div class="fg" style="display:flex;align-items:flex-end;padding-bottom:14px">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                  <input type="checkbox" [(ngModel)]="form.is_recommended"> Recommended
                </label>
              </div>
            </div>
            <div class="fg"><label>Release Notes</label><textarea class="fc" rows="3" [(ngModel)]="form.release_notes"></textarea></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showAdd=false">Cancel</button>
            <button class="btn btn-p" (click)="add()" [disabled]="!form.platform||!form.version||!form.filename">Add Firmware</button>
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

  constructor(private api: ApiService) {}
  ngOnInit() { this.load(); this.loadFamilies(); }

  load() { this.api.getFirmware({ platform: this.filterPlatform, model_family: this.filterFamily }).subscribe(d => this.firmware = d); }
  loadFamilies() { this.api.getFirmware().subscribe(d => { this.families = [...new Set(d.map(f => f.model_family))]; }); }

  formatSize(b: number): string {
    if (!b) return '—';
    if (b > 1e9) return (b / 1e9).toFixed(1) + ' GB';
    return (b / 1e6).toFixed(0) + ' MB';
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
}
