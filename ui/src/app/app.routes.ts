import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { calendarReadyGuard } from './core/calendar/calendar-ready.guard';

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/login/login').then((m) => m.Login),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/reset-password/reset-password').then((m) => m.ResetPassword),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/layout').then((m) => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'agenda' },
      {
        path: 'agenda',
        canActivate: [calendarReadyGuard],
        loadComponent: () => import('./features/agenda/agenda').then((m) => m.Agenda),
      },
      {
        path: 'connect',
        loadComponent: () => import('./features/connect/connect').then((m) => m.Connect),
      },
      {
        path: 'sync',
        loadComponent: () => import('./features/sync/sync').then((m) => m.Sync),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
