import { Routes } from '@angular/router';
import { authGuard, guestGuard, signInCallbackGuard } from './core/auth/auth.guard';
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
      // Never renders: the guard always redirects.
      { path: 'callback', canActivate: [signInCallbackGuard], children: [] },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/layout').then((m) => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'timeline' },
      // Old name: keeps bookmarks and installed PWAs working.
      { path: 'agenda', redirectTo: 'timeline' },
      {
        path: 'timeline',
        canActivate: [calendarReadyGuard],
        loadComponent: () => import('./features/timeline/timeline').then((m) => m.Timeline),
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
        path: 'places',
        loadComponent: () => import('./features/places/places').then((m) => m.Places),
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
