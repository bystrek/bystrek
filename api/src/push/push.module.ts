import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [DbModule],
  controllers: [PushController],
  providers: [PushService],
})
export class PushModule {}
