import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { GeoModule } from '../geo/geo.module';
import { llmClientProvider } from '../llm/llm.provider';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';
import { PlacesDraftController } from './places-draft.controller';
import { PlacesDraftService } from './places-draft.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [DbModule, AuthModule, GeoModule],
  controllers: [PlacesController, PlacesDraftController, PlaceVisitsController],
  providers: [PlacesService, PlaceVisitsService, PlacesDraftService, llmClientProvider],
  exports: [PlacesService],
})
export class PlacesModule {}
