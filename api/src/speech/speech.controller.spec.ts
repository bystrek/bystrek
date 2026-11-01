import { describe, expect, it, mock } from 'bun:test';
import {
  BadGatewayException,
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { SpeechController } from './speech.controller';
import type { SpeechToText } from './speech.model';

function controller(transcribe = mock(() => Promise.resolve('next meeting'))) {
  return {
    transcribe,
    controller: new SpeechController({ transcribe } as unknown as SpeechToText),
  };
}

describe('SpeechController', () => {
  it('returns the transcript of an audio body', async () => {
    const { transcribe, controller: c } = controller();
    const audio = Buffer.from([1, 2, 3]);

    expect(await c.transcribe(audio, 'audio/webm;codecs=opus')).toEqual({ text: 'next meeting' });
    expect(transcribe).toHaveBeenCalledWith(audio, 'audio/webm;codecs=opus');
  });

  it('rejects a non-audio body before calling the model', async () => {
    const { transcribe, controller: c } = controller();

    await expect(c.transcribe({ question: 'hi' }, 'application/json')).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    await expect(c.transcribe(undefined, undefined)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('rejects an empty recording', async () => {
    const { controller: c } = controller();

    await expect(c.transcribe(Buffer.alloc(0), 'audio/webm')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports a failing transcription server as a bad gateway', async () => {
    const { controller: c } = controller(mock(() => Promise.reject(new Error('down'))));

    await expect(c.transcribe(Buffer.from([1]), 'audio/webm')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
