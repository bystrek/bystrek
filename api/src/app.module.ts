import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PushModule } from './push/push.module';

@Module({
  imports: [PushModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
