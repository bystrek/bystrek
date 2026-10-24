import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { CalendarAskService, AskResponse } from '../../core/calendar/calendar-ask.service';
import { AskBar } from './ask-bar';

describe('AskBar', () => {
  it("shows the can't-do card for a write request", () => {
    const response: AskResponse = { kind: 'cant_do', text: 'I can only read your calendar.' };
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        { provide: CalendarAskService, useValue: { ask: () => of(response) } },
      ],
    });
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    fixture.componentInstance.submit('delete my dentist appointment');
    fixture.detectChanges();

    expect(fixture.componentInstance.phase()).toBe('cant_do');
    expect(el.querySelector<HTMLElement>('app-card')?.dataset['tone']).toBe('danger');
    expect(el.textContent).toContain('I can only read your calendar.');
  });

  it('cancels the in-flight question when stopped', () => {
    const pending = new Subject<AskResponse>();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        { provide: CalendarAskService, useValue: { ask: () => pending.asObservable() } },
      ],
    });
    const fixture = TestBed.createComponent(AskBar);
    const bar = fixture.componentInstance;

    bar.submit('next meeting');
    expect(bar.phase()).toBe('thinking');
    bar.stop();

    expect(bar.phase()).toBe('idle');
    expect(pending.observed).toBe(false);
  });

  it('shows how long the answer took', () => {
    const response: AskResponse = { kind: 'text', text: 'Nothing else today.' };
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        { provide: CalendarAskService, useValue: { ask: () => of(response) } },
      ],
    });
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();

    fixture.componentInstance.submit('anything else today?');
    fixture.detectChanges();

    const thought = fixture.nativeElement.querySelector('.answer-thought')?.textContent ?? '';
    expect(thought).toMatch(/^Thought for \d+\.\d s$/);
  });

  it('lists every event in a multi-event answer', () => {
    const response: AskResponse = {
      kind: 'list',
      text: '2 events.',
      events: [
        {
          uid: 'a',
          title: 'Dentist',
          start: '2026-10-27T09:00:00+01:00',
          end: '2026-10-27T09:45:00+01:00',
          startWeekday: 'Tuesday',
          durationMinutes: 45,
        },
        {
          uid: 'b',
          title: 'Team sync',
          start: '2026-10-27T11:00:00+01:00',
          end: '2026-10-27T11:30:00+01:00',
          startWeekday: 'Tuesday',
          durationMinutes: 30,
        },
      ],
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiUrl: '/api' } },
        { provide: CalendarAskService, useValue: { ask: () => of(response) } },
      ],
    });
    const fixture = TestBed.createComponent(AskBar);
    fixture.detectChanges();

    fixture.componentInstance.submit('what events do I have on Tuesday?');
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.conflicts li');
    expect(items.length).toBe(2);
    expect(items[1].textContent).toContain('Team sync');
  });
});
