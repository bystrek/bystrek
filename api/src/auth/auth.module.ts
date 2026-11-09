import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AUTH, authProvider } from './auth.provider';
import { AdminGuard, AuthGuard } from './auth.guard';
import { SignInController } from './sign-in.controller';

@Module({
  imports: [DbModule],
  controllers: [SignInController],
  providers: [authProvider, AuthGuard, AdminGuard],
  exports: [AUTH, AuthGuard, AdminGuard],
})
export class AuthModule {}
