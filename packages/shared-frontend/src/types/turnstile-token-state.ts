import type { TurnstileWidgetBindings } from "./turnstile-widget-bindings";

export interface TurnstileTokenState {
  /** The current single-use token; empty until the widget solves, and after expiry or reset. */
  token: string;
  /** Whether Turnstile is on for this bundle (a site key is configured). */
  required: boolean;
  /** True when a submit may go out: Turnstile is off, or a fresh token is held. */
  isReady: boolean;
  /** Drop the held token and re-challenge. Call after any submit that may have reached the server. */
  reset: () => void;
  widgetProps: TurnstileWidgetBindings;
}
