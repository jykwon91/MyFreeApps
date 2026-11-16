/** Imperative handle exposed by `TurnstileWidget` through its `ref` prop. */
export interface TurnstileWidgetHandle {
  /** Discard the current token and run a fresh challenge (`turnstile.reset(widgetId)`). */
  reset: () => void;
}
