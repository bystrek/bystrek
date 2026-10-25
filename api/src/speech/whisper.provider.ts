import { Logger, type Provider } from '@nestjs/common';
import { STT_BASE_URL, STT_MODEL, STT_TIMEOUT_MS } from '../env';
import { SPEECH_TO_TEXT, type SpeechToText } from './speech.model';

interface TranscriptionResponse {
  text?: string;
  error?: string | { message?: string };
}

// File extensions by recorded mime type; the server sniffs the content, the name is a hint.
const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

// Whisper marks non-speech as `[BLANK_AUDIO]`, `[Music]`, `(silence)` and the like.
const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)/g;

export function cleanTranscript(text: string): string {
  return text.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim();
}

export class WhisperSpeechToText implements SpeechToText {
  private readonly logger = new Logger(WhisperSpeechToText.name);

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const baseType = mimeType.split(';')[0].trim().toLowerCase();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: baseType }),
      `question.${EXTENSIONS[baseType] ?? 'bin'}`,
    );
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (STT_MODEL) form.append('model', STT_MODEL);

    const startedAt = performance.now();
    const response = await fetch(new URL('/v1/audio/transcriptions', STT_BASE_URL), {
      method: 'POST',
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Transcription request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as TranscriptionResponse;
    if (body.error) {
      const message = typeof body.error === 'string' ? body.error : body.error.message;
      throw new Error(`Transcription request failed: ${message ?? 'unknown error'}`);
    }
    this.logger.log(
      JSON.stringify({
        audio_bytes: audio.length,
        total_ms: Math.round(performance.now() - startedAt),
      }),
    );
    return cleanTranscript(body.text ?? '');
  }
}

export const whisperProvider: Provider = {
  provide: SPEECH_TO_TEXT,
  useFactory: () => new WhisperSpeechToText(),
};
