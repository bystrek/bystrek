// Stands in for `@ekierka/elements` when the generated fixture wrappers are compiled.
declare module '@ekierka/elements' {
  export interface PickDetail {
    id: string;
  }
  export class EkSwitch extends HTMLElement {
    value: string;
    label: string | undefined;
    size: number;
    open: boolean;
    disabled: boolean;
    readonly: boolean;
    invalid: boolean;
    required: boolean;
    touched: boolean;
    name: string;
    errors: readonly { message?: string }[];
  }
  export class EkBadge extends HTMLElement {
    tone: string;
  }
  export function defineEkSwitch(): void;
  export function defineEkBadge(): void;
}
