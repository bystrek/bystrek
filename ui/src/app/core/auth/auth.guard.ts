import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : inject(Router).createUrlTree(['/auth/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;
};

/** Where Pocket ID sign-in comes back to: `?ott=` signs in, `?error=` goes to the login page. */
export const signInCallbackGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const ott = route.queryParamMap.get('ott');
  let error = route.queryParamMap.get('error') ?? 'missing_token';
  if (ott) {
    try {
      await auth.completeSignIn(ott);
      return router.createUrlTree(['/']);
    } catch {
      error = 'invalid_token';
    }
  }
  return router.createUrlTree(['/auth/login'], { queryParams: { error } });
};
