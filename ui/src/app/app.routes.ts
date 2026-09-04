import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

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
      { path: '', pathMatch: 'full', redirectTo: 'chat' },
      { path: 'chat', loadComponent: () => import('./features/chat/chat').then((m) => m.Chat) },
      {
        path: 'agenda',
        loadComponent: () => import('./features/agenda/agenda').then((m) => m.Agenda),
      },
      {
        path: 'agenda/event/:uid',
        loadComponent: () =>
          import('./features/agenda/event-detail/event-detail').then((m) => m.EventDetail),
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
