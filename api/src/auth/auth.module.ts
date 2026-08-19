import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AUTH, authProvider } from './auth.provider';
import { AdminGuard, AuthGuard } from './auth.guard';

@Module({
  imports: [DbModule],
  providers: [authProvider, AuthGuard, AdminGuard],
  exports: [AUTH, AuthGuard, AdminGuard],
})
export class AuthModule {}
