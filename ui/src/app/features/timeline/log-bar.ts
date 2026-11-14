import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import {
  FormField,
  FormRoot,
  applyEach,
  form,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MAX_DRAFT_TEXT_LENGTH } from '../../core/diary/diary.service';
import { CommandBar } from '../../shared/command-bar/command-bar';
import { CommandResult } from '../../shared/command-bar/command-result';
import { Icon } from '../../shared/icon/icon';
import { LogBarStore } from './log-bar-store';
import { isUsedCategory, withoutCategory, withoutEvent } from './log-draft';

const nameKey = (name: string) => name.trim().toLowerCase();

// The timeline bar in log mode. The note stays in the bar after a draft so it can be refined;
// Enter on the unchanged note, or anywhere in the card, logs the draft as edited.
@Component({
  selector: 'app-log-bar',
  imports: [CommandBar, CommandResult, FormField, FormRoot, Icon],
  templateUrl: './log-bar.html',
  styleUrl: './log-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogBar {
  protected readonly store = inject(LogBarStore);
  protected readonly maxLength = MAX_DRAFT_TEXT_LENGTH;
  readonly text = model('');

  protected readonly draftForm = form(
    this.store.edits,
    (path) => {
      validate(path.events, ({ value }) =>
        value().length ? null : { kind: 'empty', message: 'Nothing left to log.' },
      );
      applyEach(path.events, (event) => {
        required(event.text, { message: 'Say what happened.' });
        required(event.occurredAt, { message: 'Pick a time.' });
        validate(event.endsAt, ({ value, valueOf }) =>
          value() && value() < valueOf(event.occurredAt)
            ? { kind: 'span', message: 'It ends before it starts.' }
            : null,
        );
      });
      // A proposed category no event is in isn't saved, so its name can't block the save.
      applyEach(path.newCategories, (category) => {
        required(category.name, {
          message: 'Name the category.',
          when: ({ valueOf }) => isUsedCategory(valueOf(category.key), valueOf(path.events)),
        });
        validate(category.name, ({ value, valueOf }) => {
          const events = valueOf(path.events);
          if (!isUsedCategory(valueOf(category.key), events)) return null;
          const clashes = valueOf(path.newCategories).filter(
            (c) => isUsedCategory(c.key, events) && nameKey(c.name) === nameKey(value()),
          );
          return clashes.length > 1
            ? { kind: 'duplicate', message: 'Two categories have this name.' }
            : null;
        });
      });
    },
    {
      submission: {
        action: async () => {
          if (await this.store.save()) this.text.set('');
          return undefined;
        },
      },
    },
  );

  send(text: string): void {
    if (this.store.confirms(text)) void submit(this.draftForm);
    else this.store.submit(text);
  }

  removeEvent(index: number): void {
    this.store.edits.update((edits) => withoutEvent(edits, index));
  }

  removeCategory(key: string): void {
    this.store.edits.update((edits) => withoutCategory(edits, key));
  }

  cancel(): void {
    this.store.cancel();
    this.text.set('');
  }
}
