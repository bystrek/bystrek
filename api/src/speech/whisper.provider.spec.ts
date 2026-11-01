import { afterEach, describe, expect, it, mock } from 'bun:test';
import { WhisperSpeechToText, cleanTranscript } from './whisper.provider';

const originalFetch = globalThis.fetch;
const AUDIO = Buffer.from([1, 2, 3]);

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(body: unknown, init?: ResponseInit) {
  const fetchMock = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, ...init })),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe('WhisperSpeechToText.transcribe', () => {
  it('posts the recording as an OpenAI-style multipart transcription request', async () => {
    const fetchMock = stubFetch({ text: ' next meeting' });

    const text = await new WhisperSpeechToText().transcribe(AUDIO, 'audio/webm;codecs=opus');

    expect(text).toBe('next meeting');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/v1/audio/transcriptions');
    const form = init.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('question.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBe(AUDIO.length);
    expect(form.get('response_format')).toBe('json');
    expect(form.get('temperature')).toBe('0');
  });

  it('rejects an unsuccessful response', async () => {
    stubFetch({}, { status: 500 });

    await expect(new WhisperSpeechToText().transcribe(AUDIO, 'audio/webm')).rejects.toThrow(
      'Transcription request failed with HTTP 500',
    );
  });

  it('rejects a response that carries an error', async () => {
    stubFetch({ error: { message: 'failed to read audio' } });

    await expect(new WhisperSpeechToText().transcribe(AUDIO, 'audio/webm')).rejects.toThrow(
      'Transcription request failed: failed to read audio',
    );
  });
});

describe('cleanTranscript', () => {
  it('drops non-speech markers and squeezes whitespace', () => {
    expect(cleanTranscript(' [BLANK_AUDIO]\n')).toBe('');
    expect(cleanTranscript('(silence) am I free\n friday? [Music]')).toBe('am I free friday?');
  });
});
