// Where a diary event came from: typed in the command bar's log mode, or imported from Apple Health (#167).
// Stored as the `event_source` Postgres enum, so adding a value needs a migration.
export const DiaryEventSource = {
  Manual: 'manual',
  Health: 'health',
} as const;
export type DiaryEventSource = (typeof DiaryEventSource)[keyof typeof DiaryEventSource];
