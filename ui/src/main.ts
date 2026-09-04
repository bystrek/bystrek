import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { ensureTemporal } from './app/core/calendar/ensure-temporal';
import { loadAppConfig } from './app/core/config/app-config';

Promise.all([loadAppConfig(), ensureTemporal()])
  .then(([config]) => bootstrapApplication(App, appConfig(config)))
  .catch((err) => console.error(err));
