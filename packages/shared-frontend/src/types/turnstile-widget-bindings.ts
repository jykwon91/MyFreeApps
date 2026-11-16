import type { RefObject } from "react";
import type { TurnstileWidgetHandle } from "./turnstile-widget-handle";

/** Props `useTurnstileToken` hands to `<TurnstileWidget {...widgetProps} />`. */
export interface TurnstileWidgetBindings {
  ref: RefObject<TurnstileWidgetHandle | null>;
  onVerify: (token: string) => void;
  onExpire: () => void;
}
