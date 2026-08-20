import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/main/main').then((m) => m.Main),
  },
  { path: '**', redirectTo: '' },
];
