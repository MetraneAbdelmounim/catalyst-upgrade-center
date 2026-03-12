import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div style="background:var(--bg-2);border:1px solid var(--border-1);border-radius:var(--r-lg);padding:36px 32px;width:92%;max-width:550px;box-shadow:0 8px 32px #0004">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:24px">
          <div class="um6p-logo" style="justify-content:center;margin-bottom:12px">
            <div class="block">U</div><div class="block">M</div><div class="block">6</div><div class="block">P</div>
          </div>
          <h1 style="font-family:var(--font-mono);font-size:14px;font-weight:700;letter-spacing:2px">NETUPGRADE</h1>
          <p class="tsm t3 mt-1">Initial Setup — Step {{step}} of 2</p>
        </div>

        <!-- Progress -->
        <div style="display:flex;gap:6px;margin-bottom:24px">
          <div *ngFor="let i of [1,2]" style="flex:1;height:4px;border-radius:2px;transition:.3s"
               [style.background]="step>=i?'var(--um6p)':'var(--border-1)'"></div>
        </div>

        <!-- Step 1: Transfer Method -->
        <div *ngIf="step===1">
          <h2 style="font-family:var(--font-mono);font-size:15px;font-weight:600;margin-bottom:6px">File Transfer Configuration</h2>
          <p class="tsm t2 mb-2">How should firmware files be transferred to switches?</p>

          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
            <label *ngFor="let m of methods" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px 16px;border-radius:var(--r-md);border:1px solid var(--border-1);transition:.15s"
                   [style.borderColor]="s.transfer_method===m.id?'var(--um6p)':'var(--border-1)'"
                   [style.background]="s.transfer_method===m.id?'var(--um6p-dim)':'transparent'">
              <input type="radio" name="method" [value]="m.id" [(ngModel)]="s.transfer_method" style="margin-top:3px">
              <div>
                <div style="font-weight:600;font-size:13px">{{m.label}}</div>
                <div class="tsm t3">{{m.desc}}</div>
              </div>
            </label>
          </div>

          <div *ngIf="s.transfer_method==='http'" style="padding:14px;background:var(--bg-0);border-radius:var(--r-md);margin-bottom:14px">
            <div class="form-row">
              <div class="fg"><label>HTTP Server IP *</label><input class="fc" [(ngModel)]="s.http_server" placeholder="10.190.100.102"></div>
              <div class="fg"><label>Port *</label><input class="fc" type="number" [(ngModel)]="s.http_port" placeholder="8080"></div>
            </div>
          </div>

          <div *ngIf="s.transfer_method==='tftp'" style="padding:14px;background:var(--bg-0);border-radius:var(--r-md);margin-bottom:14px">
            <div class="fg"><label>TFTP Server IP *</label><input class="fc" [(ngModel)]="s.tftp_server" placeholder="10.190.100.102"></div>
          </div>

          <div *ngIf="s.transfer_method==='sftp'" style="padding:14px;background:var(--bg-0);border-radius:var(--r-md);margin-bottom:14px">
            <div class="form-row">
              <div class="fg"><label>SFTP Server IP *</label><input class="fc" [(ngModel)]="s.sftp_server" placeholder="10.190.100.102"></div>
              <div class="fg"><label>Port</label><input class="fc" type="number" [(ngModel)]="s.sftp_port" placeholder="22"></div>
            </div>
            <div class="form-row">
              <div class="fg"><label>Username *</label><input class="fc" [(ngModel)]="s.sftp_username" placeholder="admin"></div>
              <div class="fg"><label>Password *</label><input class="fc" type="password" [(ngModel)]="s.sftp_password" placeholder="••••"></div>
            </div>
            <div class="fg"><label>Remote Path (absolute path on SFTP server)</label><input class="fc" [(ngModel)]="s.sftp_path" placeholder="/home/axians/images"></div>
          </div>

          <!-- Test -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button class="btn btn-g" (click)="testConnectivity()" [disabled]="testing">
              <span class="material-icons" [class.spin]="testing">{{testing?'sync':'speed'}}</span> {{testing?'Testing…':'Test Connection'}}
            </button>
            <span *ngIf="testResult" class="badge" [ngClass]="testResult.overall==='pass'?'b-success':'b-failed'">
              {{testResult.overall==='pass'?'Connected':'Failed'}}
            </span>
          </div>
          <div *ngIf="testResult?.tests?.length" style="margin-bottom:14px">
            <div *ngFor="let t of testResult.tests" style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
              <span class="material-icons" style="font-size:14px" [style.color]="t.status==='pass'?'var(--green)':'var(--red)'">{{t.status==='pass'?'check_circle':'error'}}</span>
              <span>{{t.test}} — <span class="t2">{{t.detail}}</span></span>
            </div>
          </div>
        </div>

        <!-- Step 2: SSH Defaults -->
        <div *ngIf="step===2">
          <h2 style="font-family:var(--font-mono);font-size:15px;font-weight:600;margin-bottom:6px">Default SSH Credentials</h2>
          <p class="tsm t2 mb-2">These will be pre-filled when adding switches. You can change them per-switch later.</p>

          <div class="fg"><label>Default Username</label><input class="fc" [(ngModel)]="s.ssh_default_username" placeholder="admin"></div>
          <div class="fg"><label>Default Password</label><input class="fc" type="password" [(ngModel)]="s.ssh_default_password" placeholder="••••"></div>
          <div class="fg"><label>Default Enable Password</label><input class="fc" type="password" [(ngModel)]="s.ssh_default_enable" placeholder="(optional)"></div>
        </div>

        <!-- Error -->
        <div *ngIf="error" style="background:var(--red-d);border-radius:var(--r-md);padding:10px;margin-bottom:14px;font-size:12px;color:var(--red)">{{error}}</div>

        <!-- Navigation -->
        <div style="display:flex;justify-content:space-between;margin-top:20px">
          <button class="btn btn-g" *ngIf="step>1" (click)="step=step-1"><span class="material-icons">arrow_back</span> Back</button>
          <div *ngIf="step===1"></div>
          <button class="btn btn-p" *ngIf="step<2" (click)="step=step+1">Next <span class="material-icons">arrow_forward</span></button>
          <button class="btn btn-s" *ngIf="step===2" (click)="finish()" [disabled]="saving">
            <span class="material-icons">{{saving?'sync':'check'}}</span> {{saving?'Saving…':'Finish Setup'}}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      min-height: 100vh; background: var(--bg-0);
      background-image: radial-gradient(ellipse at 30% 20%, #C8462B08 0%, transparent 60%);
    }
  `]
})
export class SetupComponent implements OnInit {
  step = 1;
  s: any = {
    transfer_method: 'http', http_server: '', http_port: 8080,
    tftp_server: '', sftp_server: '', sftp_port: 22, sftp_username: '', sftp_password: '', sftp_path: '',
    firmware_dir: '',
    ssh_default_username: 'admin', ssh_default_password: '', ssh_default_enable: '',
  };
  testing = false;
  testResult: any = null;
  saving = false;
  error = '';

  methods = [
    { id: 'http', label: 'HTTP (Recommended)', desc: 'Fastest transfer — switch pulls from your HTTP server at ~80 MB/s' },
    { id: 'tftp', label: 'TFTP', desc: 'Classic method — switch pulls from TFTP server (slower)' },
    { id: 'sftp', label: 'SFTP', desc: 'Secure FTP — switch pulls from SFTP server using username/password' },
  ];

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    // Check if setup already done
    this.api.getSetupStatus().subscribe(res => {
      if (res.setup_complete) {
        this.router.navigate(['/dashboard']);
      }
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

  finish() {
    this.saving = true;
    this.error = '';
    this.api.updateSettings({ ...this.s, setup_complete: true }).subscribe({
      next: () => { this.router.navigate(['/dashboard']); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Save failed'; }
    });
  }
}