import type { Machine, MachineSchema, Service } from '@zag-js/core';
import { createNormalizer } from '@zag-js/types';
import { normalizeProps as vanillaProps, VanillaMachine } from '@zag-js/vanilla';

// Zag's vanilla normalizer lowercases prop names (onclick, for, checked), which Stencil's JSX
// runtime applies as DOM properties, attributes or listeners as-is. One difference: Stencil
// writes an attribute set to `true` as empty and drops `false`, and ARIA needs the strings.
const normalizeProps = createNormalizer((props) => {
  const normalized: Record<string, unknown> = vanillaProps.element(props);
  for (const [key, value] of Object.entries(normalized)) {
    if (key.startsWith('aria-') && typeof value === 'boolean') normalized[key] = String(value);
  }
  return normalized;
});

/**
 * Runs a Zag machine while a Stencil component is connected. Call `start` from
 * `connectedCallback`, `stop` from `disconnectedCallback`, and pass `() => forceUpdate(this)` as
 * `onChange`. `props` is read lazily, so the machine always sees the component's current props;
 * call `refresh` when they change (from `componentShouldUpdate`) so the machine's watchers rerun.
 */
export class MachineController<T extends MachineSchema> {
  private running?: VanillaMachine<T>;

  constructor(
    private readonly machine: Machine<T>,
    private readonly props: () => Partial<T['props']>,
    private readonly onChange: () => void,
  ) {}

  // Undefined while disconnected: Stencil can still run a queued render after removal.
  connect<Api>(
    connect: (service: Service<T>, normalize: typeof normalizeProps) => Api,
  ): Api | undefined {
    return this.running && connect(this.running.service, normalizeProps);
  }

  // A stopped VanillaMachine cannot restart, and a framework may move the element (disconnect,
  // then connect again), so each connection runs a fresh one.
  start(): void {
    this.running = new VanillaMachine(this.machine, this.props);
    this.running.subscribe(this.onChange);
    this.running.start();
  }

  // VanillaMachine's way to say "props changed": an empty patch still notifies.
  refresh(): void {
    this.running?.updateProps({});
  }

  stop(): void {
    this.running?.stop();
    this.running = undefined;
  }
}
