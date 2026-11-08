import { Module } from '@nestjs/common';
import PQueue from 'p-queue';
import { GEOCODER_URL, GEOCODER_USER_AGENT } from '../env';
import { GEOCODER } from './geocoder';
import { cached, fetchJson, rateLimited } from '../http/get-json';
import { NominatimGeocoder } from './nominatim.geocoder';

// One module-owned instance: the queue and the cache only hold if every consumer shares it,
// so import GeoModule rather than re-providing GEOCODER. Both are per process: a second API
// replica would double the request rate to Nominatim.
@Module({
  providers: [
    {
      provide: GEOCODER,
      useFactory: () =>
        new NominatimGeocoder(
          // Cache outside the rate limit, so a cache hit never waits for a slot.
          cached(
            rateLimited(
              fetchJson(GEOCODER_USER_AGENT),
              // Public Nominatim's usage policy: at most 1 request per second.
              new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 }),
            ),
            // Short-lived, for refinements of the same prompt and a save right after a draft.
            { max: 500, ttl: 10 * 60_000 },
          ),
          GEOCODER_URL,
        ),
    },
  ],
  exports: [GEOCODER],
})
export class GeoModule {}
