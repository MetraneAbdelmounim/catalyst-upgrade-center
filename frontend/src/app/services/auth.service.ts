import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  must_change_password?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = environment.apiUrl+'/auth';
  private tokenKey = 'jwt_token';
  private userKey = 'jwt_user';

  user$ = new BehaviorSubject<AuthUser | null>(this.getSavedUser());

  constructor(private http: HttpClient, private router: Router) {}

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  get mustChangePassword(): boolean {
    return this.user$.value?.must_change_password === true;
  }

  get currentUser(): AuthUser | null {
    return this.user$.value;
  }

  private getSavedUser(): AuthUser | null {
    try {
      const s = localStorage.getItem(this.userKey);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.api}/login`, { username, password }).pipe(
      tap((res: any) => {
        localStorage.setItem(this.tokenKey, res.token);
        localStorage.setItem(this.userKey, JSON.stringify(res.user));
        this.user$.next(res.user);
      })
    );
  }

  register(username: string, password: string, fullName: string): Observable<any> {
    return this.http.post(`${this.api}/register`, {
      username, password, full_name: fullName
    });
  }

  changePassword(newPassword: string): Observable<any> {
    return this.http.post(`${this.api}/change-password`, { new_password: newPassword }).pipe(
      tap(() => {
        // Clear the flag locally
        const user = this.user$.value;
        if (user) {
          user.must_change_password = false;
          localStorage.setItem(this.userKey, JSON.stringify(user));
          this.user$.next({ ...user });
        }
      })
    );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.user$.next(null);
    this.router.navigate(['/login']);
  }

  setupStatus(): Observable<any> {
    return this.http.get(`${this.api}/setup-status`);
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.api}/me`);
  }
}