import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { EklComboboxComponent } from '@ekierka/lit-angular';

// Spike harness: ekl-combobox (Lit, generated wrapper) bound to a signal form field, with options that change while it is
// open (like the log bar's existing + proposed categories), inside a box that would clip it.
@Component({
  selector: 'app-lit-combobox-form-harness',
  imports: [EklComboboxComponent, FormField],
  template: `
    <div
      class="clip"
      style="overflow:hidden;height:140px;padding:24px;border:1px dashed;transform:translateZ(0)"
    >
      <ekl-combobox
        label="Category"
        placeholder="No category"
        [options]="options()"
        [formField]="draft.category"
      />
    </div>
    <p class="value">value: {{ draft.category().value() ?? 'none' }}</p>
    <p class="state">
      invalid: {{ draft.category().invalid() }}, touched: {{ draft.category().touched() }}
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" (click)="propose()">propose a category</button>
      <button type="button" (click)="existing.set(existing().slice(1))">remove first</button>
      <button type="button" (click)="model.set({ category: 'work' })">set to work</button>
      <button type="button" (click)="locked.set(!locked())">toggle locked</button>
      <button type="button" (click)="mustPick.set(!mustPick())">toggle required</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LitComboboxFormHarness {
  readonly existing = signal([
    { value: 'health', label: 'Health' },
    { value: 'home', label: 'Home' },
    { value: 'work', label: 'Work' },
  ]);
  readonly proposed = signal<{ value: string; label: string }[]>([]);
  protected readonly options = computed(() => [...this.existing(), ...this.proposed()]);

  readonly locked = signal(false);
  readonly model = signal<{ category: string | null }>({ category: null });
  readonly mustPick = signal(false);
  readonly draft = form(this.model, (path) => {
    disabled(path.category, () => this.locked());
    required(path.category, { when: () => this.mustPick() });
  });

  propose() {
    const n = this.proposed().length + 1;
    this.proposed.set([...this.proposed(), { value: `new-${n}`, label: `New ${n} (new)` }]);
  }
}
