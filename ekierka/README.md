# Ekierka

bystrek's design system. Design rules and the generator contract: bystrek/bystrek#181.

- `elements/` (`@ekierka/elements`): `tokens.css`, the CSS layer (`ekierka.css`), and Lit elements on Zag. Zag is bundled in; `lit` is a peer dependency. `bun run build` writes `dist/` and `custom-elements.json`.
- `angular/` (`@ekierka/angular`): wrappers generated from `custom-elements.json` (`bun run generate`, run by `build`). The generator is `scripts/generator.ts`; it throws on a broken convention (`ek-*-change` without its property, a control without `value`, a default that isn't a plain literal).

`ui` builds Ekierka in its `pre*` hooks, so `bun run start|build|test|storybook` in `ui/` always sees fresh output. Install once at the repo root.

## Tests

- `elements`: Vitest browser mode on Playwright. Runs Chromium, WebKit and Firefox; `EKIERKA_BROWSERS=chromium bun run test` limits it. macOS WebKit only tabs to text fields by default, so keyboard (Tab) tests belong in CI's Linux container; skip WebKit locally for those. Playwright's role queries don't follow `ariaLabelledByElements`, so assert the reference on the element (`el.ariaLabelledByElements`) rather than through `getByRole({ name })`.
- `angular`: `bun test`. Snapshot of the generated output from `test/fixtures/manifest.json`, plus a strict `tsc` compile of it. Update the snapshot with `bun test --update-snapshots`.

## Visual baselines

`ui/e2e/visual` holds Playwright screenshots of every Storybook story and key screens, with an axe check per story. CI compares them (`bun run test:visual` in `ui/`). Baselines are Linux/WebKit; regenerate them with `scripts/visual-baselines.sh`, which runs in the same Playwright container as CI. Commit the changed PNGs only for intentional visual changes.
