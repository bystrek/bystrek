import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { GeoModule } from '../geo/geo.module';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [DbModule, AuthModule, GeoModule],
  controllers: [PlacesController, PlaceVisitsController],
  providers: [PlacesService, PlaceVisitsService],
  exports: [PlacesService],
})
export class PlacesModule {}
