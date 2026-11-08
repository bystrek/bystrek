import { Module } from '@nestjs/common';
import { GEOCODER } from './geocoder';
import { NominatimGeocoder } from './nominatim.geocoder';

// One module-owned instance: the 1 request/s throttle and the cache only hold if every
// consumer shares it, so import GeoModule rather than re-providing GEOCODER.
@Module({
  providers: [{ provide: GEOCODER, useFactory: () => new NominatimGeocoder() }],
  exports: [GEOCODER],
})
export class GeoModule {}
