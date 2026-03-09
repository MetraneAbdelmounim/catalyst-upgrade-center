import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:28px">
          <div class="um6p-logo" style="justify-content:center;margin-bottom:12px">
            <div class="block">U</div>
            <div class="block">M</div>
            <div class="block">6</div>
            <div class="block">P</div>
          </div>
          <h1 style="font-family:var(--font-mono);font-size:14px;font-weight:700;letter-spacing:2px;color:var(--t1)">NETUPGRADE</h1>
          <p style="font-size:11px;color:var(--t3);margin-top:2px">Cisco Switch Upgrade Manager</p>
        </div>

        <!-- Setup notice (first user) -->
        <div *ngIf="isSetup" style="background:var(--um6p-dim);border:1px solid var(--um6p-glow);border-radius:var(--r-md);padding:12px;margin-bottom:18px;font-size:12px;color:var(--um6p-light)">
          <strong>First Time Setup</strong> — Create the admin account to get started.
        </div>

        <h2 style="font-family:var(--font-mono);font-size:15px;font-weight:600;margin-bottom:18px">
          {{isRegister ? 'Create Account' : 'Sign In'}}
        </h2>

        <div *ngIf="isRegister" class="fg">
          <label>Full Name</label>
          <input class="fc" [(ngModel)]="fullName" placeholder="John Doe" (keyup.enter)="submit()">
        </div>
        <div class="fg">
          <label>Username</label>
          <input class="fc" [(ngModel)]="username" placeholder="admin" (keyup.enter)="submit()" autofocus>
        </div>
        <div class="fg">
          <label>Password</label>
          <input class="fc" type="password" [(ngModel)]="password" placeholder="••••••••" (keyup.enter)="submit()">
        </div>

        <div *ngIf="error" style="background:var(--red-d);border:1px solid #e74c3c30;border-radius:var(--r-md);padding:10px;margin-bottom:14px;font-size:12px;color:var(--red)">
          {{error}}
        </div>

        <button class="btn btn-p" style="width:100%;justify-content:center;padding:10px;font-size:13px" (click)="submit()" [disabled]="loading">
          <span class="material-icons" *ngIf="loading" class="spin" style="font-size:16px">sync</span>
          {{loading ? 'Please wait…' : isRegister ? 'Create Account' : 'Sign In'}}
        </button>

        <div style="text-align:center;margin-top:16px;font-size:12px;color:var(--t3)">
          <span *ngIf="!isRegister && !isSetup">
            No account? <a style="cursor:pointer;color:var(--um6p-light)" (click)="isRegister=true">Register</a>
          </span>
          <span *ngIf="isRegister && !isSetup">
            Already have an account? <a style="cursor:pointer;color:var(--um6p-light)" (click)="isRegister=false">Sign In</a>
          </span>
        </div>
      </div>

      <div style="position:absolute;bottom:20px;font-size:10px;color:var(--t3);letter-spacing:.5px">
        UM6P IT — NETUPGRADE v1.0
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
      padding: 36px 32px; width: 92%; max-width: 380px;
      box-shadow: 0 8px 32px #0004;
    }
    @media (max-width: 480px) {
      .login-card { padding: 28px 20px; }
    }
  `]
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  fullName = '';
  error = '';
  loading = false;
  isRegister = false;
  isSetup = false;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    // If already logged in, redirect
    if (this.auth.isLoggedIn) {
      this.router.navigate(['/dashboard']);
      return;
    }
    // Check if first time setup
    this.auth.setupStatus().subscribe({
      next: (res) => {
        if (!res.has_users) {
          this.isSetup = true;
          this.isRegister = true;
        }
      }
    });
  }

  submit() {
    this.error = '';
    if (!this.username || !this.password) {
      this.error = 'Username and password are required';
      return;
    }
    this.loading = true;

    if (this.isRegister) {
      this.auth.register(this.username, this.password, this.fullName).subscribe({
        next: () => {
          // After register, auto-login
          this.auth.login(this.username, this.password).subscribe({
            next: () => { this.router.navigate(['/dashboard']); },
            error: (err) => { this.loading = false; this.error = err.error?.error || 'Login failed'; }
          });
        },
        error: (err) => { this.loading = false; this.error = err.error?.error || 'Registration failed'; }
      });
    } else {
      this.auth.login(this.username, this.password).subscribe({
        next: () => { this.router.navigate(['/dashboard']); },
        error: (err) => { this.loading = false; this.error = err.error?.error || 'Invalid credentials'; }
      });
    }
  }
}