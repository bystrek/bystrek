# Ekierka

bystrek's design system. Design rules and the generator contract: bystrek/bystrek#181.

- `elements/` (`@ekierka/elements`): `tokens.css`, the CSS layer (`ekierka.css`), and Lit elements on Zag. Zag is bundled in; `lit` is a peer dependency. `bun run build` writes `dist/` and `custom-elements.json`.
- CSS primitives (`elements/src/css/`, one file per primitive): classes on native markup, variants as `data-*` attributes. `ek-button`, `ek-chip`, `ek-card`, `ek-stack`, `ek-tag`, `ek-status`, `ek-progress` (a native `<progress>`). Each has stories under `elements/stories/`. A consumer that has its own global CSS must keep it in a layer below `ekierka` (`@layer legacy, ekierka;`), since unlayered rules beat layered ones.
- `angular/` (`@ekierka/angular`): wrappers generated from `custom-elements.json` (`bun run generate`, run by `build`). The generator is `scripts/generator.ts`; it throws on a broken convention (`ek-*-change` without its property, a control without `value`, a default that isn't a plain literal).

`ui` builds Ekierka in its `pre*` hooks, so `bun run start|build|test|storybook` in `ui/` always sees fresh output. Install once at the repo root.

## Tests

- `elements`: Vitest browser mode on Playwright. Runs Chromium, WebKit and Firefox; `EKIERKA_BROWSERS=chromium bun run test` limits it. macOS WebKit only tabs to text fields by default, so keyboard (Tab) tests belong in CI's Linux container; skip WebKit locally for those. Playwright's role queries don't follow `ariaLabelledByElements`, so assert the reference on the element (`el.ariaLabelledByElements`) rather than through `getByRole({ name })`.
- `angular`: `bun test`. Snapshot of the generated output from `test/fixtures/manifest.json`, plus a strict `tsc` compile of it. Update the snapshot with `bun test --update-snapshots`.

## Axe and key screens

`bun run test:visual` in `ui/` runs axe on every Storybook story and compares screenshots of login, settings and not-found (`ui/e2e/visual`). The screen baselines are Linux/WebKit; regenerate them with `scripts/visual-baselines.sh`, which runs in the same Playwright container as CI. Check story looks by eye in Storybook.

## Generator notes

- A control's `value` needs a plain literal default; the build fails otherwise.
- Two-way properties (`ek-<property>-change`) are Angular `model()`s, which can't coerce attributes: bind them (`[open]="true"`, `[(open)]="signal"`); a bare `<ek-drawer open>` is a template type error, not a silent `''`.
