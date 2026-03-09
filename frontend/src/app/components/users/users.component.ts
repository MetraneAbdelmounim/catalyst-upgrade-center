import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-head">
      <div><h2>User Management</h2><p class="sub">Manage platform users and access control</p></div>
      <button class="btn btn-p" (click)="openAdd()"><span class="material-icons">person_add</span> Add User</button>
    </div>
    <div class="page-body">

      <!-- Stats -->
      <div class="stat-row mb-2">
        <div class="stat c">
          <div class="stat-val">{{users.length}}</div>
          <div class="stat-lbl">Total Users</div>
        </div>
        <div class="stat g">
          <div class="stat-val">{{adminCount}}</div>
          <div class="stat-lbl">Admins</div>
        </div>
        <div class="stat a">
          <div class="stat-val">{{operatorCount}}</div>
          <div class="stat-lbl">Operators</div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>Username</th><th>Full Name</th><th>Role</th><th>Created</th><th>Actions</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let u of users">
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="material-icons" style="font-size:20px;color:var(--um6p)">account_circle</span>
                  <span style="font-weight:600">{{u.username}}</span>
                  <span *ngIf="u._id === auth.currentUser?.id" class="badge b-running" style="font-size:9px">You</span>
                </div>
              </td>
              <td>{{u.full_name}}</td>
              <td>
                <span class="badge" [ngClass]="u.role==='admin' ? 'b-success' : 'b-pending'">
                  {{u.role}}
                </span>
              </td>
              <td class="tsm t2">{{u.created_at | date:'medium'}}</td>
              <td>
                <div class="gap-r">
                  <button class="btn btn-sm btn-g" (click)="openEdit(u)" title="Edit">
                    <span class="material-icons">edit</span>
                  </button>
                  <button class="btn btn-sm btn-g" (click)="openResetPw(u)" title="Reset Password">
                    <span class="material-icons">lock_reset</span>
                  </button>
                  <button class="btn btn-sm btn-d" (click)="del(u)" title="Delete"
                          [disabled]="u._id === auth.currentUser?.id">
                    <span class="material-icons">delete</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="empty" *ngIf="users.length===0"><span class="material-icons">group</span><p>No users found</p></div>

      <!-- Add/Edit User Modal -->
      <div class="modal-bg" *ngIf="showModal" (click)="showModal=false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3>{{editing ? 'Edit User' : 'Add User'}}</h3>
            <button class="modal-x" (click)="showModal=false"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <div class="fg" *ngIf="!editing">
              <label>Username *</label>
              <input class="fc" [(ngModel)]="form.username" placeholder="johndoe">
            </div>
            <div class="fg">
              <label>Full Name</label>
              <input class="fc" [(ngModel)]="form.full_name" placeholder="John Doe">
            </div>
            <div class="fg">
              <label>Role</label>
              <select class="fc" [(ngModel)]="form.role">
                <option value="admin">Admin — Full access</option>
                <option value="operator">Operator — Standard access</option>
              </select>
            </div>
            <div *ngIf="!editing" style="background:var(--um6p-dim);border:1px solid var(--um6p-glow);border-radius:var(--r-md);padding:12px;margin-top:8px;font-size:12px;color:var(--um6p-light)">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span class="material-icons" style="font-size:16px">info</span>
                <strong>Default password: admin</strong>
              </div>
              <span style="color:var(--t2)">The user will be required to change their password on first login.</span>
            </div>
            <div *ngIf="formError" style="background:var(--red-d);border:1px solid #e74c3c30;border-radius:var(--r-md);padding:10px;margin-top:10px;font-size:12px;color:var(--red)">
              {{formError}}
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showModal=false">Cancel</button>
            <button class="btn btn-p" (click)="save()">
              <span class="material-icons">{{editing ? 'save' : 'person_add'}}</span>
              {{editing ? 'Save Changes' : 'Create User'}}
            </button>
          </div>
        </div>
      </div>

      <!-- Reset Password Modal -->
      <div class="modal-bg" *ngIf="showResetPw" (click)="showResetPw=false">
        <div class="modal-box" (click)="$event.stopPropagation()" style="max-width:400px">
          <div class="modal-head">
            <h3>Reset Password</h3>
            <button class="modal-x" (click)="showResetPw=false"><span class="material-icons">close</span></button>
          </div>
          <div class="modal-body">
            <p class="tsm t2 mb-2">Set a new password for <strong>{{resetUser?.username}}</strong></p>
            <div class="fg">
              <label>New Password *</label>
              <input class="fc" type="password" [(ngModel)]="newPassword" placeholder="Min 4 characters">
            </div>
            <div *ngIf="resetError" style="background:var(--red-d);border-radius:var(--r-md);padding:10px;font-size:12px;color:var(--red)">
              {{resetError}}
            </div>
            <div *ngIf="resetSuccess" style="background:var(--green-d);border-radius:var(--r-md);padding:10px;font-size:12px;color:var(--green)">
              Password updated!
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-g" (click)="showResetPw=false">Close</button>
            <button class="btn btn-p" (click)="resetPw()" [disabled]="!newPassword || newPassword.length < 4">
              <span class="material-icons">lock_reset</span> Reset Password
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  showModal = false;
  editing = false;
  editId = '';
  form: any = { role: 'operator' };
  formError = '';

  showResetPw = false;
  resetUser: any = null;
  newPassword = '';
  resetError = '';
  resetSuccess = false;

  get adminCount() { return this.users.filter(u => u.role === 'admin').length; }
  get operatorCount() { return this.users.filter(u => u.role === 'operator').length; }

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() { this.load(); }

  load() {
    this.api.getUsers().subscribe(d => this.users = d);
  }

  openAdd() {
    this.editing = false;
    this.editId = '';
    this.form = { username: '', full_name: '', role: 'operator' };
    this.formError = '';
    this.showModal = true;
  }

  openEdit(u: any) {
    this.editing = true;
    this.editId = u._id;
    this.form = { full_name: u.full_name, role: u.role };
    this.formError = '';
    this.showModal = true;
  }

  save() {
    this.formError = '';
    if (this.editing) {
      this.api.updateUser(this.editId, this.form).subscribe({
        next: () => { this.showModal = false; this.load(); },
        error: (err) => { this.formError = err.error?.error || 'Update failed'; }
      });
    } else {
      if (!this.form.username) {
        this.formError = 'Username is required';
        return;
      }
      // Always use 'admin' as default password — user must change on first login
      this.api.createUser({ ...this.form, password: 'admin' }).subscribe({
        next: () => { this.showModal = false; this.load(); },
        error: (err) => { this.formError = err.error?.error || 'Creation failed'; }
      });
    }
  }

  openResetPw(u: any) {
    this.resetUser = u;
    this.newPassword = '';
    this.resetError = '';
    this.resetSuccess = false;
    this.showResetPw = true;
  }

  resetPw() {
    this.resetError = '';
    this.resetSuccess = false;
    this.api.updateUser(this.resetUser._id, { password: this.newPassword }).subscribe({
      next: () => { this.resetSuccess = true; this.newPassword = ''; },
      error: (err) => { this.resetError = err.error?.error || 'Reset failed'; }
    });
  }

  del(u: any) {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    this.api.deleteUser(u._id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Delete failed')
    });
  }
}