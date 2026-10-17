import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  conversationId!: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @UseGuards(AuthGuard)
  async conversations(@Req() req: Request) {
    return this.chatService.listConversations(req.session!.user.id);
  }

  @Post('conversations')
  @UseGuards(AuthGuard)
  async newConversation(@Req() req: Request) {
    return this.chatService.createConversation(req.session!.user.id);
  }

  @Get('conversations/:id/history')
  @UseGuards(AuthGuard)
  async history(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.getHistory(req.session!.user.id, id);
  }

  @Delete('history')
  @UseGuards(AuthGuard)
  async clearHistory(@Req() req: Request) {
    await this.chatService.clearHistory(req.session!.user.id);
  }

  @Post()
  @UseGuards(AuthGuard)
  async chat(
    @Body() body: ChatDto,
    @Body('conversationId', ParseUUIDPipe) conversationId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (typeof body.message !== 'string' || !body.message.trim()) {
      throw new BadRequestException('message is required');
    }
    await this.chatService.requireConversation(req.session!.user.id, conversationId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    await this.chatService.reply(
      req.session!.user.id,
      conversationId,
      body.message,
      (delta) => {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      },
      (toolCalls) => {
        res.write(`data: ${JSON.stringify({ done: true, toolCalls })}\n\n`);
      },
    );

    res.end();
  }
}
