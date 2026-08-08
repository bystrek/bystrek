import { Hono } from "hono";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "./env";
import { upsertSubscription, listSubscriptions, deleteSubscription, type StoredSubscription } from "./db";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const indexFile = Bun.file(new URL("../public/index.html", import.meta.url));
const swFile = Bun.file(new URL("../public/sw.js", import.meta.url));
const touchIconFile = Bun.file(new URL("../public/apple-touch-icon.png", import.meta.url));

export const app = new Hono();

app.notFound((c) => c.json({ error: "not found" }, 404));

// Temporary: standing in as bystrek.dev's entry point until the custom app
// (see docs/architecture.md) takes over this route.
app.get("/", () => new Response(indexFile, { headers: { "Content-Type": "text/html" } }));

app.get("/apple-touch-icon.png", () => new Response(touchIconFile, { headers: { "Content-Type": "image/png" } }));

// Served at root (not /push/sw.js) so its default scope covers the whole origin.
app.get("/sw.js", () => new Response(swFile, { headers: { "Content-Type": "application/javascript" } }));

app.get("/push/vapid-public-key", (c) => c.json({ publicKey: VAPID_PUBLIC_KEY }));

app.post("/push/subscribe", async (c) => {
  const body = await c.req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return c.json({ error: "invalid subscription" }, 400);
  }
  upsertSubscription({ endpoint, p256dh, auth });
  return c.json({ ok: true }, 201);
});

app.post("/push/send", async (c) => {
  const body = await c.req.json().catch(() => null);
  const message = body?.message;
  if (typeof message !== "string" || message.length === 0) {
    return c.json({ error: "message is required" }, 400);
  }
  const title = typeof body?.title === "string" ? body.title : "bystrek";
  const payload = JSON.stringify({ title, message });

  const subscriptions = listSubscriptions();
  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub: StoredSubscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          deleteSubscription(sub.endpoint);
          removed++;
        } else {
          failed++;
        }
      }
    })
  );

  return c.json({ sent, removed, failed });
});
