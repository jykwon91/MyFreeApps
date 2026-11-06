import { useCallback, useState } from "react";
import { turnstileSiteKey } from "@/games/wow-forever/lib/humanCheckAvailability";
import type { TurnstileTokenState } from "@/games/wow-forever/types/turnstileTokenState";

/** A Cloudflare Turnstile token for one request. Tokens are single-use. */
export function useTurnstileToken(): TurnstileTokenState {
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [expired, setExpired] = useState(false);

  const onVerify = useCallback((next: string) => {
    setToken(next);
    setExpired(false);
  }, []);
  const onExpire = useCallback(() => {
    setToken("");
    setExpired(true);
  }, []);
  const reset = useCallback(() => {
    setToken("");
    setExpired(false);
    setResetKey((k) => k + 1);
  }, []);

  return { needsToken: turnstileSiteKey() !== "", token, resetKey, expired, onVerify, onExpire, reset };
}
