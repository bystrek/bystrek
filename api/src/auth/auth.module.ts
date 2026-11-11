import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AUTH, authProvider } from './auth.provider';
import { AdminGuard, AuthGuard } from './auth.guard';
import { ApiTokenGuard } from './api-token.guard';
import { SignInController } from './sign-in.controller';

@Module({
  imports: [DbModule],
  controllers: [SignInController],
  providers: [authProvider, AuthGuard, AdminGuard, ApiTokenGuard],
  exports: [AUTH, AuthGuard, AdminGuard, ApiTokenGuard],
})
export class AuthModule {}
