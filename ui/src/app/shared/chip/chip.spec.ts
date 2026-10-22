import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chip } from './chip';

@Component({
  imports: [Chip],
  template: `
    <button appChip tone="surface" (click)="clicks.set(clicks() + 1)">Ask</button>
    <button appChip disabled (click)="clicks.set(clicks() + 1)">Off</button>
  `,
})
class Host {
  readonly clicks = signal(0);
}

describe('Chip', () => {
  it('reflects tone and does not fire clicks when disabled', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [on, off] = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    );

    expect(on.dataset['tone']).toBe('surface');
    expect(off.dataset['tone']).toBe('secondary');
    on.click();
    off.click();
    expect(fixture.componentInstance.clicks()).toBe(1);
  });
});
