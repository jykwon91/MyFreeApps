import { useCallback, useMemo, useRef, useState } from "react";
import { turnstileSiteKey } from "../lib/turnstile-site-key";
import type { TurnstileTokenState } from "../types/turnstile-token-state";
import type { TurnstileWidgetHandle } from "../types/turnstile-widget-handle";

/**
 * Holds the token for one `TurnstileWidget`. Cloudflare tokens are single-use:
 * the backend's siteverify call spends the token even when the request then
 * fails (wrong invite, email taken, rate limit), so call `reset()` after any
 * failed submit that may have reached the server. Otherwise the retry sends
 * the spent token and is rejected with `timeout-or-duplicate`.
 */
export function useTurnstileToken(): TurnstileTokenState {
  const widgetRef = useRef<TurnstileWidgetHandle>(null);
  const [token, setToken] = useState("");
  const required = turnstileSiteKey() !== "";

  const onVerify = useCallback((next: string) => setToken(next), []);
  const onExpire = useCallback(() => setToken(""), []);
  const reset = useCallback(() => {
    setToken("");
    widgetRef.current?.reset();
  }, []);

  const widgetProps = useMemo(() => ({ ref: widgetRef, onVerify, onExpire }), [onVerify, onExpire]);

  return { token, required, isReady: !required || token !== "", reset, widgetProps };
}
