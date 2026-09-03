import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(APP_CONFIG).apiUrl;

  readonly status = signal('');
  readonly statusError = signal(false);
  readonly subscribed = signal(false);
  readonly busy = signal(false);

  async checkExistingSubscription(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = registration && (await registration.pushManager.getSubscription());
    if (sub) {
      this.subscribed.set(true);
      this.status.set('Already subscribed on this device.');
    }
  }

  async subscribe(): Promise<void> {
    this.busy.set(true);
    this.statusError.set(false);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        this.status.set(
          "Push isn't available here — on iPhone, add this page to your Home Screen and open it from there first.",
        );
        this.statusError.set(true);
        return;
      }

      this.status.set('Requesting permission…');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.status.set('Permission denied.');
        this.statusError.set(true);
        return;
      }

      this.status.set('Registering…');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const { publicKey } = await firstValueFrom(
        this.http.get<{ publicKey: string }>(`${this.apiUrl}/push/vapid-public-key`),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      await firstValueFrom(this.http.post(`${this.apiUrl}/push/subscribe`, subscription.toJSON()));

      this.status.set('Subscribed.');
      this.subscribed.set(true);
    } catch (err) {
      this.status.set('Something went wrong: ' + (err as Error).message);
      this.statusError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async sendTest(): Promise<void> {
    this.busy.set(true);
    this.statusError.set(false);
    this.status.set('Sending…');
    try {
      const result = await firstValueFrom(
        this.http.post<{ sent: number; removed: number; failed: number }>(
          `${this.apiUrl}/push/send`,
          { title: 'bystrek', message: 'Test notification — this is working.' },
        ),
      );
      this.status.set(
        `Sent to ${result.sent}, removed ${result.removed}, failed ${result.failed}.`,
      );
    } catch (err) {
      this.status.set('Something went wrong: ' + (err as Error).message);
      this.statusError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
