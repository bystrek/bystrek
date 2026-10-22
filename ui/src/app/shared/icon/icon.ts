import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import arrowLeft from '@phosphor-icons/core/assets/bold/arrow-left-bold.svg';
import arrowRight from '@phosphor-icons/core/assets/bold/arrow-right-bold.svg';
import arrowUp from '@phosphor-icons/core/assets/bold/arrow-up-bold.svg';
import calendar from '@phosphor-icons/core/assets/bold/calendar-blank-bold.svg';
import caretLeft from '@phosphor-icons/core/assets/bold/caret-left-bold.svg';
import caretRight from '@phosphor-icons/core/assets/bold/caret-right-bold.svg';
import check from '@phosphor-icons/core/assets/bold/check-bold.svg';
import clock from '@phosphor-icons/core/assets/bold/clock-bold.svg';
import cornerDownRight from '@phosphor-icons/core/assets/bold/arrow-elbow-down-right-bold.svg';
import info from '@phosphor-icons/core/assets/bold/info-bold.svg';
import mapPin from '@phosphor-icons/core/assets/bold/map-pin-bold.svg';
import note from '@phosphor-icons/core/assets/bold/note-bold.svg';
import stop from '@phosphor-icons/core/assets/fill/stop-fill.svg';
import warning from '@phosphor-icons/core/assets/bold/warning-bold.svg';
import x from '@phosphor-icons/core/assets/bold/x-bold.svg';

const ICONS = {
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  calendar,
  'chevron-left': caretLeft,
  'chevron-right': caretRight,
  check,
  clock,
  'corner-down-right': cornerDownRight,
  info,
  'map-pin': mapPin,
  note,
  stop,
  warning,
  x,
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
