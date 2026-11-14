import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { EklDialogComponent } from '@ekierka/lit-angular';

// Spike harness: ekl-dialog (behaviour-only, light DOM) driven from Angular with [(open)], with
// projected content Angular keeps changing and a signal form inside.
@Component({
  selector: 'app-lit-dialog-harness',
  imports: [EklDialogComponent, FormField],
  template: `
    <button #trigger type="button" class="trigger" (click)="open.set(true)">Rename place</button>
    <p class="state">open: {{ open() }}, saved: {{ saved() ?? 'nothing' }}</p>

    <ekl-dialog [(open)]="open" [returnFocus]="trigger">
      <h2 ekl-dialog-title>{{ title() }}</h2>
      @if (described()) {
        <p ekl-dialog-description>Everyone with access sees the new name.</p>
      }
      <form (submit)="$event.preventDefault(); save()">
        <label>Name <input [formField]="rename.name" /></label>
        @if (rename.name().touched() && rename.name().invalid()) {
          <p class="error">Give it a name.</p>
        }
        <button type="button" ekl-dialog-close>Cancel</button>
        <button type="submit">Save</button>
      </form>
    </ekl-dialog>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button type="button" (click)="title.set(title() + '!')">change title</button>
      <button type="button" (click)="described.set(!described())">toggle description</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LitDialogHarness {
  readonly open = signal(false);
  readonly title = signal('Rename place');
  readonly described = signal(true);
  readonly saved = signal<string | null>(null);
  readonly rename = form(signal({ name: 'Café Camelot' }), (path) => required(path.name));

  save() {
    if (this.rename().invalid()) return;
    this.saved.set(this.rename.name().value());
    this.open.set(false);
  }
}
