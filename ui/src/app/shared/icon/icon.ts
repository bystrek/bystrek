import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  ARROW_ELBOW_DOWN_RIGHT_BOLD,
  ARROW_LEFT_BOLD,
  ARROW_RIGHT_BOLD,
  ARROW_UP_BOLD,
  CALENDAR_BLANK_BOLD,
  CARET_LEFT_BOLD,
  CARET_RIGHT_BOLD,
  CHECK_BOLD,
  CLOCK_BOLD,
  INFO_BOLD,
  MAP_PIN_BOLD,
  MICROPHONE_BOLD,
  NOTE_BOLD,
  STOP_FILL,
  WARNING_BOLD,
  X_BOLD,
} from './icon-svgs';

const ICONS = {
  'arrow-left': ARROW_LEFT_BOLD,
  'arrow-right': ARROW_RIGHT_BOLD,
  'arrow-up': ARROW_UP_BOLD,
  calendar: CALENDAR_BLANK_BOLD,
  'chevron-left': CARET_LEFT_BOLD,
  'chevron-right': CARET_RIGHT_BOLD,
  check: CHECK_BOLD,
  clock: CLOCK_BOLD,
  'corner-down-right': ARROW_ELBOW_DOWN_RIGHT_BOLD,
  info: INFO_BOLD,
  'map-pin': MAP_PIN_BOLD,
  microphone: MICROPHONE_BOLD,
  note: NOTE_BOLD,
  stop: STOP_FILL,
  warning: WARNING_BOLD,
  x: X_BOLD,
} as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

@Component({
  selector: 'app-icon',
  template: `<span class="app-icon" [innerHTML]="svg()"></span>`,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]),
  );
}
