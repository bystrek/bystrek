import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';

class ChatDto {
  message!: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @UseGuards(AuthGuard)
  async chat(@Body() body: ChatDto, @Req() req: Request, @Res() res: Response) {
    if (!body.message || !body.message.trim()) {
      throw new BadRequestException('message is required');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    await this.chatService.reply(
      req.session!.user.id,
      body.message,
      (delta) => {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      },
    );

    res.end();
  }
}
