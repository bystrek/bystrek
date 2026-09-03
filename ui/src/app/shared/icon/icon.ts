import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import arrowUp from 'pixelarticons/svg/arrow-up.svg';
import squareAlert from 'pixelarticons/svg/square-alert.svg';

const ICONS = {
  'square-alert': squareAlert,
  'arrow-up': arrowUp,
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
