import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { EkTestToggle } from './toggle.js';

const mount = async (parent: ParentNode = document.body) => {
  const el = new EkTestToggle();
  parent.append(el);
  await el.updateComplete;
  return el;
};

test('renders nothing until connected, then the machine drives the markup', async () => {
  const el = new EkTestToggle();
  expect(el.querySelector('button')).toBeNull();
  document.body.append(el);
  await el.updateComplete;
  expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  el.remove();
});

test('clicking re-renders from machine state', async () => {
  const el = await mount();
  await userEvent.click(page.getByRole('button', { name: 'toggle' }));
  await el.updateComplete;
  expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  el.remove();
});

test('moving the element restarts the machine', async () => {
  const el = await mount();
  const other = document.body.appendChild(document.createElement('div'));
  other.append(el);
  await el.updateComplete;
  await userEvent.click(page.getByRole('button', { name: 'toggle' }));
  await el.updateComplete;
  expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  el.remove();
  other.remove();
});

test('light-DOM styles are adopted into the document', async () => {
  const el = await mount();
  expect(getComputedStyle(el.querySelector('button')!).outlineColor).toBe('rgb(1, 2, 3)');
  el.remove();
});

test('light-DOM styles are adopted into a shadow root that hosts the element', async () => {
  const host = document.body.appendChild(document.createElement('div'));
  const root = host.attachShadow({ mode: 'open' });
  const el = await mount(root);
  expect(root.adoptedStyleSheets.length).toBe(1);
  expect(getComputedStyle(el.querySelector('button')!).outlineColor).toBe('rgb(1, 2, 3)');
  // A second element in the same root doesn't adopt the sheet again.
  await mount(root);
  expect(root.adoptedStyleSheets.length).toBe(1);
  host.remove();
});
