import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div><h2>Settings</h2><p class="sub">Configure file transfer, SSH defaults, and system options</p></div>
      <button class="btn btn-p" (click)="save()" [disabled]="saving">
        <span class="material-icons">{{saving ? 'sync' : 'save'}}</span> {{saving ? 'Saving…' : 'Save Settings'}}
      </button>
    </div>
    <div class="page-body">
      <div *ngIf="saved" style="background:var(--green-d);border:1px solid #2ecc7130;border-radius:var(--r-md);padding:12px;margin-bottom:16px;font-size:13px;color:var(--green);display:flex;align-items:center;gap:8px">
        <span class="material-icons" style="font-size:18px">check_circle</span> Settings saved successfully!
      </div>

      <!-- Transfer Method -->
      <div class="card">
        <div class="card-head"><span class="card-title">File Transfer</span></div>
        <div class="fg">
          <label>Transfer Method</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label *ngFor="let m of methods" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border-radius:var(--r-md);border:1px solid var(--border-1);transition:.15s"
                   [style.borderColor]="s.transfer_method===m.id?'var(--um6p)':'var(--border-1)'"
                   [style.background]="s.transfer_method===m.id?'var(--um6p-dim)':'transparent'">
              <input type="radio" name="method" [value]="m.id" [(ngModel)]="s.transfer_method">
              <div>
                <div style="font-weight:600;font-size:13px">{{m.label}}</div>
                <div class="tsm t3">{{m.desc}}</div>
              </div>
            </label>
          </div>
        </div>

        <!-- HTTP settings -->
        <div *ngIf="s.transfer_method==='http'" style="margin-top:14px;padding:16px;background:var(--bg-0);border-radius:var(--r-md)">
          <div class="form-row">
            <div class="fg">
              <label>HTTP Server IP *</label>
              <input class="fc" [(ngModel)]="s.http_server" placeholder="10.190.100.102">
            </div>
            <div class="fg">
              <label>HTTP Port *</label>
              <input class="fc" type="number" [(ngModel)]="s.http_port" placeholder="8080">
            </div>
          </div>
          <p class="tsm t3">The switch will pull firmware from: http://{{s.http_server || '?'}}:{{s.http_port || '?'}}/filename.bin</p>
        </div>

        <!-- TFTP settings -->
        <div *ngIf="s.transfer_method==='tftp'" style="margin-top:14px;padding:16px;background:var(--bg-0);border-radius:var(--r-md)">
          <div class="fg">
            <label>TFTP Server IP *</label>
            <input class="fc" [(ngModel)]="s.tftp_server" placeholder="10.190.100.102" style="max-width:300px">
          </div>
          <p class="tsm t3">The switch will pull firmware from: tftp://{{s.tftp_server || '?'}}/filename.bin</p>
        </div>

        <!-- SFTP settings -->
        <div *ngIf="s.transfer_method==='sftp'" style="margin-top:14px;padding:16px;background:var(--bg-0);border-radius:var(--r-md)">
          <div class="form-row">
            <div class="fg"><label>SFTP Server IP *</label><input class="fc" [(ngModel)]="s.sftp_server" placeholder="10.190.100.102"></div>
            <div class="fg"><label>SFTP Port</label><input class="fc" type="number" [(ngModel)]="s.sftp_port" placeholder="22"></div>
          </div>
          <div class="form-row">
            <div class="fg"><label>SFTP Username *</label><input class="fc" [(ngModel)]="s.sftp_username" placeholder="admin"></div>
            <div class="fg"><label>SFTP Password *</label><input class="fc" type="password" [(ngModel)]="s.sftp_password" placeholder="••••"></div>
          </div>
          <div class="fg"><label>Remote Path (relative to SFTP user's home directory)</label><input class="fc" [(ngModel)]="s.sftp_path" placeholder="images  (e.g. for /home/axians/images/)" style="max-width:400px"></div>
          <p class="tsm t3">Switch command: <span class="mono">{{getSftpPreview()}}</span></p>
          <p class="tsm t3" style="margin-top:4px">If files are in <span class="mono">/home/{{s.sftp_username || 'user'}}/images/</span>, set path to <strong>images</strong></p>
        </div>

        <!-- Connectivity Test -->
        <div style="margin-top:16px;display:flex;align-items:center;gap:10px">
          <button class="btn btn-g" (click)="testConnectivity()" [disabled]="testing">
            <span class="material-icons" [class.spin]="testing">{{testing ? 'sync' : 'speed'}}</span>
            {{testing ? 'Testing…' : 'Test Connectivity'}}
          </button>
          <span *ngIf="testResult" class="badge" [ngClass]="testResult.overall==='pass' ? 'b-success' : 'b-failed'">
            {{testResult.overall === 'pass' ? 'All tests passed' : 'Some tests failed'}}
          </span>
        </div>
        <div *ngIf="testResult?.tests?.length" style="margin-top:10px">
          <div *ngFor="let t of testResult.tests" style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px">
            <span class="material-icons" style="font-size:16px" [style.color]="t.status==='pass'?'var(--green)':'var(--red)'">
              {{t.status==='pass' ? 'check_circle' : 'error'}}
            </span>
            <span style="font-weight:600;min-width:200px">{{t.test}}</span>
            <span class="t2">{{t.detail}}</span>
          </div>
        </div>
      </div>

      <!-- SSH Defaults -->
      <div class="card">
        <div class="card-head"><span class="card-title">SSH Defaults</span></div>
        <p class="tsm t2 mb-2">Default credentials used when adding new switches or during bulk import.</p>
        <div class="form-row">
          <div class="fg">
            <label>Default Username</label>
            <input class="fc" [(ngModel)]="s.ssh_default_username" placeholder="admin">
          </div>
          <div class="fg">
            <label>Default Password</label>
            <input class="fc" type="password" [(ngModel)]="s.ssh_default_password" placeholder="••••">
          </div>
        </div>
        <div class="fg" style="max-width:50%">
          <label>Default Enable Password</label>
          <input class="fc" type="password" [(ngModel)]="s.ssh_default_enable" placeholder="••••">
        </div>
      </div>

      <!-- System -->
      <div class="card">
        <div class="card-head"><span class="card-title">System</span></div>
        <div class="form-row">
          <div class="fg">
            <label>Health Check Interval (seconds)</label>
            <input class="fc" type="number" [(ngModel)]="s.health_check_interval" placeholder="60">
            <p class="tsm t3 mt-1">How often to ping all switches. Set 0 to disable.</p>
          </div>
          <div class="fg">
            <label>Ping Timeout (seconds)</label>
            <input class="fc" type="number" [(ngModel)]="s.ping_timeout" placeholder="2">
          </div>
        </div>
        <div class="fg">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" [(ngModel)]="s.simulation_mode"> Simulation Mode
          </label>
          <p class="tsm t3 mt-1">When enabled, upgrades are simulated without touching real switches.</p>
        </div>
      </div>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  s: any = {};
  saving = false;
  saved = false;
  testing = false;
  testResult: any = null;

  methods = [
    { id: 'http', label: 'HTTP', desc: 'Fastest — switch pulls from HTTP server (~80 MB/s)' },
    { id: 'tftp', label: 'TFTP', desc: 'Legacy — switch pulls from TFTP server' },
    { id: 'sftp', label: 'SFTP', desc: 'Secure FTP — switch pulls from SFTP server using credentials' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getSettings().subscribe(d => this.s = d);
  }

  save() {
    this.saving = true;
    this.saved = false;
    this.api.updateSettings(this.s).subscribe({
      next: (res) => {
        this.s = res;
        this.saving = false;
        this.saved = true;
        setTimeout(() => this.saved = false, 4000);
      },
      error: () => { this.saving = false; }
    });
  }

  testConnectivity() {
    this.testing = true;
    this.testResult = null;
    this.api.testConnectivity(this.s).subscribe({
      next: (res) => { this.testResult = res; this.testing = false; },
      error: () => { this.testing = false; }
    });
  }

  getSftpPreview(): string {
    const user = this.s.sftp_username || '?';
    const host = this.s.sftp_server || '?';
    const path = (this.s.sftp_path || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const filePath = path ? `${path}/filename.bin` : 'filename.bin';
    return `copy sftp://${user}@${host}/${filePath} flash:`;
  }
}