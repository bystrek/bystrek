import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

// Returns a cold observable so the caller can cancel an in-flight transcription.
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  /** The spoken words in `audio`; empty when nothing was said. */
  transcribe(audio: Blob): Observable<string> {
    return this.http
      .post<{ text: string }>(`${this.apiUrl}/speech/transcribe`, audio, {
        headers: { 'Content-Type': audio.type || 'audio/webm' },
      })
      .pipe(map((res) => res.text));
  }
}
