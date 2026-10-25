import { Pipe, PipeTransform } from '@angular/core';
import { Temporal } from '@js-temporal/polyfill';
import { clockTime, formatDuration, minutesUntil, toWeekdayAndDate } from './agenda-format';

@Pipe({ name: 'weekdayAndDate' })
export class WeekdayAndDatePipe implements PipeTransform {
  transform(day: Temporal.PlainDate | string): string {
    return toWeekdayAndDate(typeof day === 'string' ? Temporal.PlainDate.from(day) : day);
  }
}

@Pipe({ name: 'clockTime' })
export class ClockTimePipe implements PipeTransform {
  transform(iso: string): string {
    return clockTime(iso);
  }
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(minutes: number): string {
    return formatDuration(minutes);
  }
}

@Pipe({ name: 'minutesUntil' })
export class MinutesUntilPipe implements PipeTransform {
  transform(iso: string, now: Temporal.Instant): number {
    return minutesUntil(iso, now);
  }
}
