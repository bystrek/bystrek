import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { UsersService } from './users.service';

class InviteDto {
  email!: string;
  name!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard)
  async listUsers() {
    return this.usersService.listUsers();
  }

  @Post('invite')
  @UseGuards(AdminGuard)
  async invite(@Body() body: InviteDto, @Req() req: Request) {
    const user = await this.usersService.invite(
      body.email,
      body.name,
      fromNodeHeaders(req.headers),
    );
    return { user };
  }

  @Post(':id/ban')
  @UseGuards(AdminGuard)
  async ban(@Param('id') id: string, @Req() req: Request) {
    await this.usersService.setBanned(id, true, fromNodeHeaders(req.headers));
    return { status: true };
  }

  @Post(':id/unban')
  @UseGuards(AdminGuard)
  async unban(@Param('id') id: string, @Req() req: Request) {
    await this.usersService.setBanned(id, false, fromNodeHeaders(req.headers));
    return { status: true };
  }
}
