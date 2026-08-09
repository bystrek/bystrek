import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import webpush from 'web-push';
import { DRIZZLE } from '../db/drizzle.provider';
import * as schema from '../db/schema';
import { subscriptions } from '../db/schema';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../env';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  getVapidPublicKey() {
    return { publicKey: VAPID_PUBLIC_KEY };
  }

  async subscribe(input: SubscriptionInput) {
    await this.db
      .insert(subscriptions)
      .values({
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      })
      .onConflictDoUpdate({
        target: subscriptions.endpoint,
        set: { p256dh: input.keys.p256dh, auth: input.keys.auth },
      });
  }

  async send(title: string, message: string) {
    const rows = await this.db.select().from(subscriptions);
    const payload = JSON.stringify({ title, message });

    let sent = 0;
    let removed = 0;
    let failed = 0;

    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.db
              .delete(subscriptions)
              .where(eq(subscriptions.endpoint, sub.endpoint));
            removed++;
          } else {
            failed++;
          }
        }
      }),
    );

    return { sent, removed, failed };
  }
}
