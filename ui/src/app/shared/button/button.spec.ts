import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <button appButton variant="primary" shape="icon" block (click)="clicks.set(clicks() + 1)">
      Go
    </button>
    <a appButton href="#x" aria-disabled="true" (click)="clicks.set(clicks() + 1)">Link</a>
  `,
})
class Host {
  readonly clicks = signal(0);
}

describe('Button', () => {
  it('reflects variant, shape and block as data attributes', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const btn: HTMLElement = fixture.nativeElement.querySelector('button');

    expect(btn.dataset['variant']).toBe('primary');
    expect(btn.dataset['shape']).toBe('icon');
    expect(btn.hasAttribute('data-block')).toBe(true);
  });

  it('emits clicks on enabled buttons but swallows them on aria-disabled anchors', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    el.querySelector('button')!.click();
    expect(fixture.componentInstance.clicks()).toBe(1);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.querySelector('a')!.dispatchEvent(event);
    expect(fixture.componentInstance.clicks()).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
