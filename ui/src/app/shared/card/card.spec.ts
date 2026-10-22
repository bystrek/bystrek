import { TestBed } from '@angular/core/testing';
import { Card } from './card';

describe('Card', () => {
  it('defaults to a heavy surface card and reflects inputs', () => {
    const fixture = TestBed.createComponent(Card);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.dataset['tone']).toBe('surface');
    expect(host.dataset['weight']).toBe('heavy');

    fixture.componentRef.setInput('tone', 'danger');
    fixture.componentRef.setInput('weight', 'thin');
    fixture.detectChanges();
    expect(host.dataset['tone']).toBe('danger');
    expect(host.dataset['weight']).toBe('thin');
  });
});
