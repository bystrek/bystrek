import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HouseholdModule } from './household/household.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [PushModule, HouseholdModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
