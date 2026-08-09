import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { HouseholdController } from './household.controller';
import { HouseholdService } from './household.service';

@Module({
  imports: [DbModule],
  controllers: [HouseholdController],
  providers: [HouseholdService],
})
export class HouseholdModule {}
