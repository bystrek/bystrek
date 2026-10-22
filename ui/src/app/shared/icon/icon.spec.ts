import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';

describe('Icon', () => {
  it('is hidden from assistive tech and renders an svg', () => {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'x');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg')).not.toBeNull();
  });
});
