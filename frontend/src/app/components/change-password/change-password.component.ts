import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div style="text-align:center;margin-bottom:24px">
          <div class="um6p-logo" style="justify-content:center;margin-bottom:12px">
            <div class="block">U</div>
            <div class="block">M</div>
            <div class="block">6</div>
            <div class="block">P</div>
          </div>
          <h1 style="font-family:var(--font-mono);font-size:14px;font-weight:700;letter-spacing:2px;color:var(--t1)">NETUPGRADE</h1>
        </div>

        <div style="background:var(--um6p-dim);border:1px solid var(--um6p-glow);border-radius:var(--r-md);padding:14px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="material-icons" style="font-size:20px;color:var(--um6p-light)">lock_reset</span>
            <strong style="font-size:13px;color:var(--um6p-light)">Password Change Required</strong>
          </div>
          <p style="font-size:12px;color:var(--t2)">
            Welcome, <strong>{{auth.currentUser?.full_name}}</strong>! Your administrator requires you to set a new password before continuing.
          </p>
        </div>

        <div class="fg">
          <label>New Password</label>
          <input class="fc" type="password" [(ngModel)]="newPassword" placeholder="Min 4 characters" (keyup.enter)="submit()">
        </div>
        <div class="fg">
          <label>Confirm Password</label>
          <input class="fc" type="password" [(ngModel)]="confirmPassword" placeholder="Repeat password" (keyup.enter)="submit()">
        </div>

        <div *ngIf="error" style="background:var(--red-d);border:1px solid #e74c3c30;border-radius:var(--r-md);padding:10px;margin-bottom:14px;font-size:12px;color:var(--red)">
          {{error}}
        </div>

        <button class="btn btn-p" style="width:100%;justify-content:center;padding:10px;font-size:13px" (click)="submit()" [disabled]="loading">
          <span class="material-icons" style="font-size:16px">{{loading ? 'sync' : 'lock_reset'}}</span>
          {{loading ? 'Updating…' : 'Set New Password'}}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      min-height: 100vh; background: var(--bg-0);
      background-image: radial-gradient(ellipse at 30% 20%, #C8462B08 0%, transparent 60%),
                         radial-gradient(ellipse at 70% 80%, #C8462B05 0%, transparent 50%);
    }
    .login-card {
      background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--r-lg);
      padding: 36px 32px; width: 92%; max-width: 400px;
      box-shadow: 0 8px 32px #0004;
    }
  `]
})
export class ChangePasswordComponent implements OnInit {
  newPassword = '';
  confirmPassword = '';
  error = '';
  loading = false;

  constructor(public auth: AuthService, private router: Router) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/login']);
      return;
    }
    if (!this.auth.mustChangePassword) {
      this.router.navigate(['/dashboard']);
    }
  }

  submit() {
    this.error = '';
    if (!this.newPassword || this.newPassword.length < 4) {
      this.error = 'Password must be at least 4 characters';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }
    this.loading = true;
    this.auth.changePassword(this.newPassword).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Password change failed';
      }
    });
  }
}