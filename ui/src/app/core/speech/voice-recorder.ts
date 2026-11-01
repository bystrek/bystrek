import { Injectable } from '@angular/core';

// Opus first: smallest uploads. Safari only records mp4/aac.
const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** One microphone recording at a time, through MediaRecorder. */
@Injectable({ providedIn: 'root' })
export class VoiceRecorder {
  readonly supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  /** Asks for the microphone and starts recording. Rejects when access is denied. */
  async start(): Promise<void> {
    this.cancel();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder.addEventListener('dataavailable', (e) => this.chunks.push(e.data));
    this.recorder.start();
  }

  /** Stops recording, releases the microphone and resolves with the audio. */
  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('not recording'));
    return new Promise((resolve) => {
      recorder.addEventListener(
        'stop',
        () => resolve(new Blob(this.chunks, { type: recorder.mimeType })),
        { once: true },
      );
      this.release();
    });
  }

  /** Stops recording and drops the audio. */
  cancel(): void {
    this.release();
    this.chunks = [];
  }

  private release(): void {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    if (recorder.state !== 'inactive') recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
  }
}
