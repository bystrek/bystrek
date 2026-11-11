// Also for another user's event: the log is private, so it doesn't exist for them.
export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`Event ${id} not found`);
    this.name = 'EventNotFoundError';
  }
}

// A category id that isn't one of the user's own.
export class UnknownCategoryError extends Error {
  constructor(id: string) {
    super(`Category ${id} not found`);
    this.name = 'UnknownCategoryError';
  }
}

// An edit that would end the event before it starts.
export class InvalidSpanError extends Error {
  constructor() {
    super('endsAt must not be before occurredAt');
    this.name = 'InvalidSpanError';
  }
}
