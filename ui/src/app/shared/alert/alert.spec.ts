import { TestBed } from '@angular/core/testing';
import { Alert } from './alert';

describe('Alert', () => {
  function create(tone: 'danger' | 'neutral', dismissible = true) {
    const fixture = TestBed.createComponent(Alert);
    fixture.componentRef.setInput('heading', 'Oops');
    fixture.componentRef.setInput('tone', tone);
    fixture.componentRef.setInput('dismissible', dismissible);
    fixture.detectChanges();
    return fixture;
  }

  it('uses role=alert for danger and role=status otherwise', () => {
    expect(create('danger').nativeElement.getAttribute('role')).toBe('alert');
    expect(create('neutral').nativeElement.getAttribute('role')).toBe('status');
  });

  it('emits dismissed from a labelled button, which can be omitted', () => {
    const fixture = create('danger');
    let count = 0;
    fixture.componentInstance.dismissed.subscribe(() => count++);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    expect(button.getAttribute('aria-label')).toBe('Dismiss');
    button.click();
    expect(count).toBe(1);
    expect(create('danger', false).nativeElement.querySelector('button')).toBeNull();
  });
});
