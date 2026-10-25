export interface SpeechToText {
  // The spoken words as plain text; empty when nothing was said.
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}

export const SPEECH_TO_TEXT = Symbol('SPEECH_TO_TEXT');
