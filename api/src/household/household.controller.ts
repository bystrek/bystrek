import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { HouseholdService } from './household.service';

class InviteDto {
  email!: string;
  name!: string;
}

@Controller('household')
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getHousehold() {
    const household = await this.householdService.getHousehold();
    if (!household) {
      throw new NotFoundException('no household configured');
    }
    return household;
  }

  @Post('invite')
  @UseGuards(AdminGuard)
  async invite(@Body() body: InviteDto, @Req() req: Request) {
    const member = await this.householdService.invite(
      body.email,
      body.name,
      fromNodeHeaders(req.headers),
    );
    return { member };
  }

  @Post('members/:id/ban')
  @UseGuards(AdminGuard)
  async ban(@Param('id') id: string, @Req() req: Request) {
    await this.householdService.setBanned(id, true, fromNodeHeaders(req.headers));
    return { status: true };
  }

  @Post('members/:id/unban')
  @UseGuards(AdminGuard)
  async unban(@Param('id') id: string, @Req() req: Request) {
    await this.householdService.setBanned(id, false, fromNodeHeaders(req.headers));
    return { status: true };
  }
}
