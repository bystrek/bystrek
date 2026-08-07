import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "./data/subscriptions.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const upsertStmt = db.prepare(
  `INSERT INTO subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
   ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
);

export function upsertSubscription(sub: StoredSubscription) {
  upsertStmt.run(sub.endpoint, sub.p256dh, sub.auth);
}

export function listSubscriptions(): StoredSubscription[] {
  return db.query("SELECT endpoint, p256dh, auth FROM subscriptions").all() as StoredSubscription[];
}

export function deleteSubscription(endpoint: string) {
  db.prepare("DELETE FROM subscriptions WHERE endpoint = ?").run(endpoint);
}
