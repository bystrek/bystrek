// Where a logged event came from: typed into the log bar, or imported from Apple Health (#167).
// Stored as the `event_source` Postgres enum, so adding a value needs a migration.
export const EventSource = {
  Manual: 'manual',
  Health: 'health',
} as const;
export type EventSource = (typeof EventSource)[keyof typeof EventSource];
