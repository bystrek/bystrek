// Mirrors main.ts's bootstrap — tests don't go through it otherwise.
import { ensureTemporal } from './app/core/calendar/ensure-temporal';

await ensureTemporal();
