import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SPEECH_TO_TEXT, type SpeechToText } from './speech.model';

// About a minute of browser-recorded opus; the UI stops recording well before that.
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

@Controller('speech/transcribe')
@UseGuards(AuthGuard)
export class SpeechController {
  private readonly logger = new Logger(SpeechController.name);

  constructor(@Inject(SPEECH_TO_TEXT) private readonly speech: SpeechToText) {}

  // The body is the raw recording (`Content-Type: audio/*`), parsed by SpeechModule's middleware.
  @Post()
  @HttpCode(200)
  async transcribe(
    @Body() body: unknown,
    @Headers('content-type') contentType: string | undefined,
  ): Promise<{ text: string }> {
    if (!contentType?.toLowerCase().startsWith('audio/') || !Buffer.isBuffer(body)) {
      throw new UnsupportedMediaTypeException('send the recording as an audio/* body');
    }
    if (body.length === 0) throw new BadRequestException('the recording is empty');

    try {
      return { text: await this.speech.transcribe(body, contentType) };
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      throw new BadGatewayException('transcription failed');
    }
  }
}
