// The real app's bootstrap (main.ts) ensures Temporal is present before
// anything else runs; the test runner has no equivalent bootstrap, so
// unit tests need the same step here.
import { ensureTemporal } from './app/core/calendar/ensure-temporal';

await ensureTemporal();
