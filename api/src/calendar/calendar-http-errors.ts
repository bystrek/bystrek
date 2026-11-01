import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CaldavMovedError, CaldavUnavailableError } from './caldav-transport';
import {
  CalendarChangedError,
  CalendarEventNotFoundError,
  CalendarNotConfiguredError,
  CalendarNotReadyError,
  CalendarUrlMismatchError,
} from './calendar.errors';

// Maps calendar errors to HTTP responses for the calendar controllers.
export async function withCalendarErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CalendarEventNotFoundError) throw new NotFoundException(err.message);
    if (err instanceof CalendarNotConfiguredError) throw new BadRequestException(err.message);
    if (err instanceof CalendarUrlMismatchError) throw new BadRequestException(err.message);
    // 409 sends the UI to the sync screen (GET /calendar/sync has the progress).
    if (err instanceof CalendarNotReadyError) throw new ConflictException(err.message);
    if (err instanceof CalendarChangedError) throw new ConflictException(err.message);
    if (err instanceof CaldavUnavailableError || err instanceof CaldavMovedError) {
      throw new ServiceUnavailableException("Couldn't reach your calendar server.");
    }
    throw err;
  }
}
