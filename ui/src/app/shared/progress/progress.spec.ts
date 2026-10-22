import { TestBed } from '@angular/core/testing';
import { Progress } from './progress';

describe('Progress', () => {
  it('is an indeterminate, labelled progressbar by default', () => {
    const fixture = TestBed.createComponent(Progress);
    fixture.componentRef.setInput('label', 'Reading your calendar');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('role')).toBe('progressbar');
    expect(host.getAttribute('aria-label')).toBe('Reading your calendar');
    expect(host.hasAttribute('aria-valuenow')).toBe(false);
    expect(host.hasAttribute('data-indeterminate')).toBe(true);
  });

  it('clamps a determinate value and exposes aria-valuenow', () => {
    const fixture = TestBed.createComponent(Progress);
    fixture.componentRef.setInput('label', 'Upload');
    fixture.componentRef.setInput('value', 140);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('aria-valuenow')).toBe('100');
    expect(host.hasAttribute('data-indeterminate')).toBe(false);
  });
});
