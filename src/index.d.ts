export type HoldVariant = 'danger' | 'success' | (string & {});

export interface HoldColors {
  progress?: string;
  danger?: string;
  success?: string;
  indicator?: string;
  surface?: string;
}

export type HoldCallback<T extends Element = HTMLElement, D = unknown> = (
  element: T,
  event: Event,
  datum: D
) => void;

export type HoldCancelCallback<T extends Element = HTMLElement, D = unknown> = (
  element: T,
  event: Event | undefined,
  datum: D,
  reason: 'cancelled' | 'blurred'
) => void;

export interface HoldButtonOptions<
  T extends Element = HTMLElement,
  D = unknown
> {
  duration?: number;
  injectStyles?: boolean;
  keyboard?: boolean;
  variant?: HoldVariant;
  colors?: HoldColors;
  onComplete?: HoldCallback<T, D>;
  onStart?: HoldCallback<T, D>;
  onCancel?: HoldCancelCallback<T, D>;
}

export interface D3SelectionLike<T extends Element = HTMLElement, D = unknown> {
  each(
    callback: (this: T, datum: D, index: number, groups?: unknown) => void
  ): unknown;
}

export type HoldTarget<T extends Element = HTMLElement, D = unknown> =
  | T
  | string
  | Iterable<T>
  | D3SelectionLike<T, D>;

export interface HoldController<T extends Element = HTMLElement, D = unknown> {
  elements: T[];
  reset(elements?: T | Iterable<T>): HoldController<T, D>;
  update(options?: Partial<HoldButtonOptions<T, D>>): HoldController<T, D>;
  destroy(): void;
}

export function holdButton<T extends Element = HTMLElement, D = unknown>(
  targets: HoldTarget<T, D>,
  options?: HoldButtonOptions<T, D>
): HoldController<T, D>;

export function holdButton<T extends Element = HTMLElement, D = unknown>(
  targets: HoldTarget<T, D>,
  onComplete?: HoldCallback<T, D>,
  durationOrOptions?: number | HoldButtonOptions<T, D>
): HoldController<T, D>;

export interface HoldToConfirmActionReturn<
  T extends Element = HTMLElement,
  D = unknown
> {
  update(parameters?: HoldButtonOptions<T, D>): void;
  destroy(): void;
  reset(): void;
}

export function holdToConfirm<T extends Element = HTMLElement, D = unknown>(
  node: T,
  parameters?: HoldButtonOptions<T, D>
): HoldToConfirmActionReturn<T, D>;

export const holdButtonStyles: string;
export function injectHoldButtonStyles(doc?: Document): HTMLStyleElement | null;

export default holdButton;
