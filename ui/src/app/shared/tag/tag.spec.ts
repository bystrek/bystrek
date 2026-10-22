import { TestBed } from '@angular/core/testing';
import { Tag } from './tag';

describe('Tag', () => {
  it('renders a leading icon only when one is given', () => {
    const fixture = TestBed.createComponent(Tag);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('app-icon')).toBeNull();

    fixture.componentRef.setInput('icon', 'clock');
    fixture.detectChanges();
    expect(host.querySelector('app-icon')).not.toBeNull();
  });
});
