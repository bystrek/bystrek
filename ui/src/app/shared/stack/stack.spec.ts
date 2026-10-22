import { TestBed } from '@angular/core/testing';
import { Stack } from './stack';

describe('Stack', () => {
  it('defaults to a vertical, stretched stack with a space-3 gap', () => {
    const fixture = TestBed.createComponent(Stack);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('data-direction')).toBe('vertical');
    expect(host.getAttribute('data-align')).toBe('stretch');
    expect(host.style.gap).toBe('var(--space-3)');
  });

  it('applies the requested direction, alignment and gap token', () => {
    const fixture = TestBed.createComponent(Stack);
    fixture.componentRef.setInput('direction', 'horizontal');
    fixture.componentRef.setInput('align', 'center');
    fixture.componentRef.setInput('gap', 'space-6');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('data-direction')).toBe('horizontal');
    expect(host.getAttribute('data-align')).toBe('center');
    expect(host.style.gap).toBe('var(--space-6)');
  });
});
