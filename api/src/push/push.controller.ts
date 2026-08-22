import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PushService, SubscriptionInput } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Post('subscribe')
  @HttpCode(201)
  async subscribe(@Body() body: Partial<SubscriptionInput>) {
    if (
      typeof body?.endpoint !== 'string' ||
      typeof body?.keys?.p256dh !== 'string' ||
      typeof body?.keys?.auth !== 'string'
    ) {
      throw new BadRequestException('invalid subscription');
    }
    await this.pushService.subscribe(body as SubscriptionInput);
    return { ok: true };
  }

  @Post('send')
  send(@Body() body: { title?: string; message?: string }) {
    if (typeof body?.message !== 'string' || body.message.length === 0) {
      throw new BadRequestException('message is required');
    }
    return this.pushService.send(body.title ?? 'bystrek', body.message);
  }
}
