import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/** Attaches the stored bearer token, if any, to requests against the API.
 * Applied uniformly — including to the unguarded /push/* routes, which
 * don't read the header at all, so an extra Authorization header there is
 * inert rather than something worth special-casing. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token && req.url.startsWith(inject(APP_CONFIG).apiUrl)) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
