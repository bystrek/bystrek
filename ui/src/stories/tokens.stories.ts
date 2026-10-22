import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular-vite';

@Component({
  selector: 'app-tokens-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Colours</h2>
    <div class="grid">
      @for (c of colours; track c) {
        <div class="swatch">
          <div class="chip" [style.background]="'var(' + c + ')'"></div>
          <code>{{ c }}</code>
        </div>
      }
    </div>

    <h2>Borders</h2>
    <div class="grid">
      <div class="box" style="border: var(--border-heavy)">heavy</div>
      <div class="box" style="border: var(--border-thin)">thin</div>
      <div class="box" style="border: var(--border-dashed)">dashed</div>
    </div>

    <h2>Shadows</h2>
    <div class="grid">
      <div class="box" style="border: var(--border-heavy); box-shadow: var(--shadow)">shadow</div>
      <div class="box" style="border: var(--border-heavy); box-shadow: var(--shadow-sm)">
        shadow-sm
      </div>
      <div class="box" style="border: var(--border-heavy); box-shadow: var(--shadow-press)">
        shadow-press
      </div>
    </div>

    <h2>Type scale</h2>
    <p
      class="type"
      style="font-family: var(--font-ui); font-weight: 700; font-size: var(--text-display)"
    >
      Display 40 · Space Grotesk
    </p>
    @for (t of sizes; track t) {
      <p class="type" [style.font-size]="'var(' + t + ')'">
        <code>{{ t }}</code> The quick brown fox
        <span style="font-family: var(--font-mono)">09:30 mono</span>
      </p>
    }
    <p class="type caps" style="font: 500 var(--text-xs) var(--font-mono)">
      Uppercase label with tracking-caps
    </p>

    <h2>Spacing and tap target</h2>
    @for (s of spaces; track s) {
      <div class="space">
        <code>{{ s }}</code>
        <span class="bar" [style.width]="'var(' + s + ')'"></span>
      </div>
    }
    <div class="space">
      <code>--tap</code>
      <span class="bar" style="width: var(--tap); height: var(--tap)"></span>
    </div>

    <h2>Motion</h2>
    <p><code>--motion-fast</code>: 80ms (0ms under prefers-reduced-motion)</p>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-6);
    }
    h2 {
      margin: var(--space-6) 0 var(--space-3);
      font-family: var(--font-ui);
    }
    .grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
    }
    .swatch {
      width: 150px;
      font: 500 var(--text-xs) var(--font-mono);
    }
    .chip {
      height: 56px;
      border: var(--border-heavy);
      margin-bottom: var(--space-1);
    }
    .box {
      display: grid;
      place-items: center;
      width: 140px;
      height: 70px;
      background: var(--color-surface);
      font: 500 var(--text-sm) var(--font-mono);
    }
    .type {
      margin: var(--space-2) 0;
      font-family: var(--font-ui);
    }
    .caps {
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
    }
    .space {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin: var(--space-1) 0;
      font: 500 var(--text-xs) var(--font-mono);
    }
    .space code {
      width: 80px;
    }
    .bar {
      display: inline-block;
      height: 12px;
      background: var(--color-ink);
    }
  `,
})
class TokensPage {
  protected readonly colours = [
    '--color-bg',
    '--color-surface',
    '--color-ink',
    '--color-ink-muted',
    '--color-ink-subtle',
    '--color-primary',
    '--color-secondary',
    '--color-danger',
  ];
  protected readonly sizes = ['--text-xs', '--text-sm', '--text-md', '--text-lg', '--text-xl'];
  protected readonly spaces = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-6'];
}

const meta: Meta<TokensPage> = {
  title: 'Foundations/Tokens',
  component: TokensPage,
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const Overview: StoryObj<TokensPage> = {};
