import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import arrowLeft from 'pixelarticons/svg/arrow-left.svg';
import arrowUp from 'pixelarticons/svg/arrow-up.svg';
import calendar from 'pixelarticons/svg/calendar.svg';
import chevronLeft from 'pixelarticons/svg/chevron-left.svg';
import chevronRight from 'pixelarticons/svg/chevron-right.svg';
import clock from 'pixelarticons/svg/clock.svg';
import mapPin from 'pixelarticons/svg/map-pin.svg';
import note from 'pixelarticons/svg/note.svg';
import squareAlert from 'pixelarticons/svg/square-alert.svg';

const ICONS = {
  'square-alert': squareAlert,
  'arrow-up': arrowUp,
  'arrow-left': arrowLeft,
  calendar,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  clock,
  'map-pin': mapPin,
  note,
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  template: `<span class="app-icon" [innerHTML]="svg()"></span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]),
  );
}
