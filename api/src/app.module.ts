import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { DiaryModule } from './diary/diary.module';
import { PlacesModule } from './places/places.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [UsersModule, AuthModule, CalendarModule, PlacesModule, DiaryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
