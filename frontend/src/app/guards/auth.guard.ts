import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { map, catchError, of } from 'rxjs';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const api = inject(ApiService);

  if (!auth.isLoggedIn) {
    router.navigate(['/login']);
    return false;
  }

  if (auth.mustChangePassword) {
    router.navigate(['/change-password']);
    return false;
  }

  // Allow setup page itself without checking setup_complete
  if (route.routeConfig?.path === 'setup') {
    return true;
  }

  // Check if initial setup is complete
  return api.getSetupStatus().pipe(
    map(res => {
      if (!res.setup_complete && auth.currentUser?.role === 'admin') {
        router.navigate(['/setup']);
        return false;
      }
      return true;
    }),
    catchError(() => of(true))  // if check fails, allow access
  );
};