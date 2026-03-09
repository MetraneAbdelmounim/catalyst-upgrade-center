import { Component, OnInit, OnDestroy, NgZone, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Switch, Firmware, UpgradeJob } from '../../models/interfaces';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div><h2>Upgrade Center</h2><p class="sub">Select switches, choose firmware, and execute upgrades</p></div>
      <button class="btn btn-g" (click)="loadHistory()"><span class="material-icons">history</span> History</button>
    </div>
    <div class="page-body">

      <!-- ═══ STEP 1: Select Switches ═══ -->
      <div class="card" *ngIf="step===1">
        <div class="card-head">
          <span class="card-title">Step 1 — Select Switches</span>
          <span class="t2 tsm">{{selectedCount}} selected</span>
        </div>
        <div class="gap-r mb-2">
          <input class="fc" style="max-width:260px" placeholder="Filter switches…" [(ngModel)]="swSearch" (ngModelChange)="filterSwitches()">
          <select class="fc" style="max-width:150px" [(ngModel)]="swPlatform" (ngModelChange)="filterSwitches()">
            <option value="">All Platforms</option><option value="IOS-XE">IOS-XE</option><option value="NX-OS">NX-OS</option>
          </select>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th style="width:40px"><input type="checkbox" (change)="toggleAll($event)" [checked]="allSelected"></th><th>Name</th><th>IP</th><th>Model</th><th>Platform</th><th>Stack</th><th>Current Version</th><th>Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let sw of filteredSwitches" [style.opacity]="sw.status==='upgrading'?0.4:1">
                <td><input type="checkbox" [(ngModel)]="sw.selected" [disabled]="sw.status==='upgrading'" (change)="countSelected()"></td>
                <td style="font-weight:600">{{sw.name}}</td>
                <td class="mono">{{sw.ip_address}}</td>
                <td class="mono tsm">{{sw.model}}</td>
                <td><span class="badge b-running" style="font-size:10px">{{sw.platform}}</span></td>
                <td>
                  <span *ngIf="sw.is_stack" class="badge" style="background:var(--indigo-d);color:var(--indigo);font-size:10px">×{{sw.stack_count}}</span>
                  <span *ngIf="!sw.is_stack" class="t3 tsm">—</span>
                </td>
                <td class="mono">{{sw.current_version}}</td>
                <td><span class="badge" [ngClass]="'b-'+sw.status"><span class="dot"></span>{{sw.status}}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-2" style="text-align:right">
          <button class="btn btn-p" (click)="goStep2()" [disabled]="selectedCount===0">
            Continue — Select Firmware <span class="material-icons">arrow_forward</span>
          </button>
        </div>
      </div>

      <!-- ═══ STEP 2: Select Firmware ═══ -->
      <div class="card" *ngIf="step===2">
        <div class="card-head">
          <span class="card-title">Step 2 — Select Target Firmware</span>
          <button class="btn btn-sm btn-g" (click)="step=1"><span class="material-icons">arrow_back</span> Back</button>
        </div>
        <p class="t2 tsm mb-2">Upgrading {{selectedCount}} switch(es). Compatible firmware shown below.</p>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th style="width:40px"></th><th>Platform</th><th>Model</th><th>Version</th><th>Filename</th><th>Size</th><th>Release</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let fw of compatibleFirmware" [class.selected-row]="selectedFirmware?._id===fw._id"
                  style="cursor:pointer" (click)="selectedFirmware=fw">
                <td><input type="radio" name="fw" [checked]="selectedFirmware?._id===fw._id"></td>
                <td><span class="badge b-running" style="font-size:10px">{{fw.platform}}</span></td>
                <td>{{fw.model_family}}</td>
                <td class="mono" style="font-weight:600">{{fw.version}}</td>
                <td class="mono tsm t2">{{fw.filename}}</td>
                <td class="mono tsm">{{fmtSize(fw.file_size)}}</td>
                <td class="tsm t2">{{fw.release_date | date:'mediumDate'}}</td>
                <td><span class="b-rec" *ngIf="fw.is_recommended">Recommended</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div *ngIf="selectedFirmware?.release_notes" class="card mt-2" style="background:var(--bg-0)">
          <p class="tsm t2"><strong>Release Notes:</strong> {{selectedFirmware.release_notes}}</p>
        </div>
        <div class="mt-2 between">
          <div class="t2 tsm" *ngIf="selectedFirmware">Target: <strong class="mono" style="color:var(--um6p-light)">{{selectedFirmware.version}}</strong></div>
          <button class="btn btn-s" (click)="startUpgrade()" [disabled]="!selectedFirmware">
            <span class="material-icons">rocket_launch</span> Start Upgrade
          </button>
        </div>
      </div>

      <!-- ═══ STEP 3: Live Progress ═══ -->
      <div *ngIf="step===3">
        <div class="card" *ngFor="let job of activeJobs; let i = index; trackBy: trackJob" style="position:relative;overflow:hidden">
          <!-- Glow accent on top -->
          <div [style.background]="job.status==='success'?'var(--green)':job.status==='failed'?'var(--red)':'var(--um6p)'"
               style="position:absolute;top:0;left:0;right:0;height:3px"></div>

          <div class="between mb-2">
            <div>
              <div style="font-weight:700;font-size:15px">
                {{job.switch_name}}
                <span *ngIf="job.is_stack" class="badge" style="background:var(--indigo-d);color:var(--indigo);font-size:10px;margin-left:8px;vertical-align:middle">
                  STACK ×{{job.stack_count}}
                </span>
              </div>
              <div class="mono tsm t2">{{job.switch_ip}} → {{job.firmware_version}}</div>
            </div>
            <div style="text-align:center">
              <!-- SVG Progress Ring -->
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-0)" stroke-width="6"/>
                <circle cx="40" cy="40" r="34" fill="none"
                        [attr.stroke]="job.status==='success'?'var(--green)':job.status==='failed'?'var(--red)':'var(--um6p)'"
                        stroke-width="6" stroke-linecap="round"
                        [attr.stroke-dasharray]="2*3.1416*34"
                        [attr.stroke-dashoffset]="2*3.1416*34*(1-job.overall_progress/100)"
                        transform="rotate(-90 40 40)"
                        style="transition:stroke-dashoffset 0.5s ease"/>
                <text x="40" y="44" text-anchor="middle" fill="var(--t1)"
                      style="font-family:var(--font-mono);font-size:16px;font-weight:700">
                  {{job.overall_progress}}%
                </text>
              </svg>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="prog-track mb-2">
            <div class="prog-fill" [class.ok]="job.status==='success'" [class.err]="job.status==='failed'"
                 [style.width.%]="job.overall_progress"></div>
          </div>

          <div class="between mb-2">
            <div class="tsm">
              <span class="badge" [ngClass]="'b-'+job.status"><span class="dot"></span>{{job.current_step}}</span>
            </div>
            <div class="mono tsm t2">{{job.status | uppercase}}</div>
          </div>

          <!-- Step Timeline -->
          <div *ngIf="job.steps?.length" class="step-timeline-scroll" [id]="'steps-' + i" style="max-height:300px;overflow-y:auto">
            <div class="step" *ngFor="let s of job.steps; let si = index; trackBy: trackStep">
              <div class="step-ic" [ngClass]="{
                'ok': s.status==='success' || s.progress===100 || si < job.steps.length - 1 && s.status!=='failed',
                'run': si === job.steps.length - 1 && s.status==='running' && s.progress < 100,
                'err': s.status==='failed',
                'wait': s.status==='pending'
              }">
                <span class="material-icons">
                  {{s.status==='failed' ? 'close' : (si < job.steps.length - 1 || s.status==='success' || s.progress===100) ? 'check' : s.status==='running' ? 'sync' : 'schedule'}}
                </span>
              </div>
              <div class="step-body">
                <div class="step-name">{{s.step}}</div>
                <div class="step-det">{{s.detail}}</div>
              </div>
              <div class="step-ts">{{s.timestamp | date:'HH:mm:ss'}}</div>
            </div>
          </div>

          <!-- Stack Member Progress -->
          <div *ngIf="job.is_stack && job.stack_members_progress && objectKeys(job.stack_members_progress).length"
               style="margin-top:14px;padding:14px;background:var(--bg-0);border-radius:var(--r-md);border:1px solid var(--border-0)">
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--t2);margin-bottom:10px;letter-spacing:0.8px;text-transform:uppercase">
              Stack Members ({{job.stack_count}})
            </div>
            <div *ngFor="let key of objectKeys(job.stack_members_progress)" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div class="mono tsm" style="width:30px;color:var(--t2)">#{{key}}</div>
              <div class="tsm" style="width:62px;text-transform:uppercase;font-weight:600"
                   [style.color]="job.stack_members_progress[key].role==='active'?'var(--cyan)':job.stack_members_progress[key].role==='standby'?'var(--amber)':'var(--t2)'">
                {{job.stack_members_progress[key].role}}
              </div>
              <div class="mono tsm t2" style="width:90px">{{job.stack_members_progress[key].model}}</div>
              <div class="prog-track" style="flex:1;height:5px">
                <div class="prog-fill" [class.ok]="job.stack_members_progress[key].status==='upgraded'"
                     [style.width.%]="job.stack_members_progress[key].progress"></div>
              </div>
              <div class="mono tsm" style="width:35px;text-align:right"
                   [style.color]="job.stack_members_progress[key].status==='upgraded'?'var(--green)':'var(--t2)'">
                {{job.stack_members_progress[key].progress}}%
              </div>
              <span class="badge tsm"
                    [ngClass]="{'b-success':job.stack_members_progress[key].status==='upgraded','b-running':job.stack_members_progress[key].status==='transferring'||job.stack_members_progress[key].status==='installing'||job.stack_members_progress[key].status==='booting','b-pending':job.stack_members_progress[key].status==='pending'||job.stack_members_progress[key].status==='detected'}"
                    style="font-size:9px;min-width:65px;justify-content:center">
                {{job.stack_members_progress[key].status}}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-2" style="text-align:center" *ngIf="allDone">
          <button class="btn btn-p" (click)="reset()"><span class="material-icons">replay</span> New Upgrade</button>
        </div>
      </div>

      <!-- ═══ History ═══ -->
      <div class="card" *ngIf="showHistory">
        <div class="card-head">
          <span class="card-title">Upgrade History</span>
          <button class="btn btn-sm btn-g" (click)="showHistory=false"><span class="material-icons">close</span></button>
        </div>
        <div class="tbl-wrap" *ngIf="history.length">
          <table>
            <thead><tr><th>Switch</th><th>IP</th><th>From</th><th>To</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead>
            <tbody>
              <tr *ngFor="let h of pagedHistory">
                <td>{{h.switch_name}}</td>
                <td class="mono">{{h.switch_ip}}</td>
                <td class="mono">{{h.previous_version}}</td>
                <td class="mono">{{h.target_version}}</td>
                <td><span class="badge" [ngClass]="'b-'+h.status"><span class="dot"></span>{{h.status}}</span></td>
                <td class="tsm t2">{{h.started_at | date:'short'}}</td>
                <td class="tsm t2">{{h.finished_at | date:'short'}}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination -->
        <div class="pagination" *ngIf="history.length > 0">
          <div class="pg-info">{{(histPage-1)*histPageSize+1}}–{{min(histPage*histPageSize, history.length)}} of {{history.length}}</div>
          <div class="pg-controls">
            <div class="pg-size">
              <span>Show</span>
              <select [(ngModel)]="histPageSize" (ngModelChange)="histPage=1">
                <option [value]="20">20</option><option [value]="50">50</option><option [value]="100">100</option>
              </select>
            </div>
            <button class="pg-btn" [disabled]="histPage<=1" (click)="histPage=1"><span class="material-icons" style="font-size:16px">first_page</span></button>
            <button class="pg-btn" [disabled]="histPage<=1" (click)="histPage=histPage-1"><span class="material-icons" style="font-size:16px">chevron_left</span></button>
            <span class="pg-info">{{histPage}} / {{histTotalPages}}</span>
            <button class="pg-btn" [disabled]="histPage>=histTotalPages" (click)="histPage=histPage+1"><span class="material-icons" style="font-size:16px">chevron_right</span></button>
            <button class="pg-btn" [disabled]="histPage>=histTotalPages" (click)="histPage=histTotalPages"><span class="material-icons" style="font-size:16px">last_page</span></button>
          </div>
        </div>
        <div class="empty" *ngIf="!history.length"><span class="material-icons">update</span><p>No upgrade history</p></div>
      </div>
    </div>
  `,
  styles: [`
    .selected-row { background: var(--um6p-dim) !important; }
    input[type="radio"] { accent-color: var(--um6p); width: 15px; height: 15px; cursor: pointer; }
  `]
})
export class UpgradeComponent implements OnInit, OnDestroy, AfterViewChecked {
  private _lastStepCounts: number[] = [];
  step = 1;
  switches: Switch[] = [];
  filteredSwitches: Switch[] = [];
  swSearch = ''; swPlatform = '';
  selectedCount = 0;
  allSelected = false;

  compatibleFirmware: Firmware[] = [];
  selectedFirmware: Firmware | null = null;

  activeJobs: UpgradeJob[] = [];
  eventSources: EventSource[] = [];
  allDone = false;

  history: any[] = [];
  showHistory = false;

  // History pagination
  histPage = 1;
  histPageSize: number = 20;
  get histTotalPages(): number { return Math.max(1, Math.ceil(this.history.length / this.histPageSize)); }
  get pagedHistory(): any[] {
    const s = (this.histPage - 1) * this.histPageSize;
    return this.history.slice(s, s + +this.histPageSize);
  }
  min(a: number, b: number) { return Math.min(a, b); }

  constructor(private api: ApiService, private zone: NgZone) {}

  ngOnInit() {
    this.api.getSwitches().subscribe(d => {
      this.switches = d.map(s => ({ ...s, selected: false }));
      this.filteredSwitches = [...this.switches];
    });

    // Check for active upgrades — restore progress view if any are running
    this.api.getActive().subscribe(activeJobs => {
      if (activeJobs && activeJobs.length > 0) {
        this.activeJobs = activeJobs.map((j: any) => ({
          ...j,
          firmware_version: j.target_version || j.firmware_version,
          is_stack: j.is_stack || false,
          stack_count: j.stack_count || 1,
          stack_members_progress: j.stack_members_progress || {},
        }));
        this.step = 3;
        this.allDone = false;

        // Reconnect SSE or start polling for each active job
        activeJobs.forEach((j: any, i: number) => {
          const jobId = j.job_id;
          if (j.status !== 'success' && j.status !== 'failed') {
            this._connectSSE(jobId, i);
          } else {
            this.checkAllDone();
          }
        });
      }
    });
  }

  ngOnDestroy() { this.eventSources.forEach(es => es.close()); }

  ngAfterViewChecked() {
    // Auto-scroll step timelines to bottom when new steps are added
    this.activeJobs.forEach((job, i) => {
      const count = job.steps?.length || 0;
      if (count !== (this._lastStepCounts[i] || 0)) {
        this._lastStepCounts[i] = count;
        // Use setTimeout to scroll AFTER Angular finishes rendering the new step
        setTimeout(() => {
          const el = document.getElementById('steps-' + i);
          if (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }
        }, 50);
      }
    });
  }

  filterSwitches() {
    this.filteredSwitches = this.switches.filter(s => {
      const matchSearch = !this.swSearch ||
        s.name.toLowerCase().includes(this.swSearch.toLowerCase()) ||
        s.ip_address.includes(this.swSearch) ||
        s.model.toLowerCase().includes(this.swSearch.toLowerCase());
      const matchPlatform = !this.swPlatform || s.platform === this.swPlatform;
      return matchSearch && matchPlatform;
    });
  }

  toggleAll(e: any) {
    const checked = e.target.checked;
    this.filteredSwitches.forEach(s => { if (s.status !== 'upgrading') s.selected = checked; });
    this.countSelected();
  }

  countSelected() {
    this.selectedCount = this.switches.filter(s => s.selected).length;
    this.allSelected = this.filteredSwitches.every(s => s.selected || s.status === 'upgrading');
  }

  goStep2() {
    const selected = this.switches.filter(s => s.selected);
    const platforms = [...new Set(selected.map(s => s.platform))];
    // Load compatible firmware for selected platforms
    this.api.getFirmware().subscribe(fw => {
      this.compatibleFirmware = fw.filter(f => platforms.includes(f.platform));
      this.selectedFirmware = this.compatibleFirmware.find(f => f.is_recommended) || null;
      this.step = 2;
    });
  }

  fmtSize(b: number): string {
    if (!b) return '—';
    return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB';
  }

  objectKeys = Object.keys;

  trackJob(index: number, job: any): string { return job.job_id; }
  trackStep(index: number, step: any): string { return index + '-' + step.timestamp; }

  startUpgrade() {
    if (!this.selectedFirmware) return;
    const ids = this.switches.filter(s => s.selected).map(s => s._id!);
    this.api.startUpgrade(ids, this.selectedFirmware._id!).subscribe((resp: any) => {
      const jobs = resp.jobs || resp;  // handle both batch and legacy format
      this.activeJobs = jobs.map((j: any) => ({
        ...j, status: 'pending', overall_progress: 0, current_step: 'Queued', steps: [],
        firmware_version: j.target_version,
        is_stack: j.is_stack || false,
        stack_count: j.stack_count || 1,
        stack_members_progress: {},
      }));
      this.step = 3;
      this.allDone = false;

      // Start SSE for each job with auto-reconnect
      jobs.forEach((j: any, i: number) => {
        this._connectSSE(j.job_id, i);
      });
    });
  }

  private _sseRetries: { [key: string]: number } = {};

  private _connectSSE(jobId: string, index: number) {
    const es = this.api.streamProgress(jobId);
    this.eventSources.push(es);

    es.onmessage = (event) => {
      this.zone.run(() => {
        const data = JSON.parse(event.data);
        if (data.status === 'not_found') { es.close(); return; }
        const job = this.activeJobs[index];
        if (job) {
          Object.assign(job, data);
        }
        this._sseRetries[jobId] = 0; // reset retries on success
        this.checkAllDone();
      });
    };

    es.onerror = () => {
      es.close();
      const job = this.activeJobs[index];
      if (job && job.status !== 'success' && job.status !== 'failed') {
        const retries = (this._sseRetries[jobId] || 0) + 1;
        this._sseRetries[jobId] = retries;

        if (retries <= 3) {
          // Retry SSE after a delay
          console.log(`SSE dropped for ${jobId}, reconnecting (attempt ${retries}/3)…`);
          setTimeout(() => this._connectSSE(jobId, index), 3000);
        } else {
          // Fall back to polling
          console.log(`SSE failed 3 times for ${jobId}, switching to polling`);
          this._pollJob(jobId, index);
        }
      }
    };
  }

  private _pollJob(jobId: string, index: number) {
    const poll = () => {
      if (this.activeJobs[index]?.status === 'success' || this.activeJobs[index]?.status === 'failed') return;
      this.api.getProgress(jobId).subscribe({
        next: (data) => {
          this.zone.run(() => {
            const job = this.activeJobs[index];
            if (job) { Object.assign(job, data); }
            this.checkAllDone();
            if (data.status !== 'success' && data.status !== 'failed') {
              setTimeout(poll, 3000);
            }
          });
        },
        error: () => { setTimeout(poll, 5000); }
      });
    };
    poll();
  }

  checkAllDone() {
    this.allDone = this.activeJobs.every(j => j.status === 'success' || j.status === 'failed');
  }

  reset() {
    this.eventSources.forEach(es => es.close());
    this.eventSources = [];
    this.activeJobs = [];
    this.selectedFirmware = null;
    this.step = 1;
    this.ngOnInit();
  }

  loadHistory() {
    this.api.getHistory({ limit: 500 }).subscribe(d => { this.history = d; this.showHistory = true; this.histPage = 1; });
  }
}