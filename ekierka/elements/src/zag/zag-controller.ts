import type { Machine, MachineSchema, Service } from '@zag-js/core';
import { normalizeProps, VanillaMachine } from '@zag-js/vanilla';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * Runs a Zag machine while a Lit element is connected, and re-renders the element when the
 * machine changes. `props` is read lazily, so the machine always sees the element's current
 * properties; call `refresh` from `willUpdate` when they change so the machine's watchers rerun.
 */
export class ZagController<T extends MachineSchema> implements ReactiveController {
  private running?: VanillaMachine<T>;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly machine: Machine<T>,
    private readonly props: () => Partial<T['props']>,
  ) {
    host.addController(this);
  }

  // A stopped VanillaMachine cannot restart, and a framework may move the element (disconnect,
  // then connect again), so each connection runs a fresh one.
  hostConnected(): void {
    this.running = new VanillaMachine(this.machine, this.props);
    this.running.subscribe(() => this.host.requestUpdate());
    this.running.start();
    // The element may be re-attached with its old markup; render again against the new machine.
    this.host.requestUpdate();
  }

  hostDisconnected(): void {
    this.running?.stop();
    this.running = undefined;
  }

  // VanillaMachine's way to say "props changed": an empty patch still notifies.
  refresh(): void {
    this.running?.updateProps({});
  }

  // Undefined while disconnected.
  connect<Api>(
    connect: (service: Service<T>, normalize: typeof normalizeProps) => Api,
  ): Api | undefined {
    return this.running && connect(this.running.service, normalizeProps);
  }
}
