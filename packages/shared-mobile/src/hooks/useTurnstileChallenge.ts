import { useCallback, useMemo, useRef, useState } from "react";
import type { TurnstileChallengeHandle } from "../types/TurnstileChallengeHandle";
import type { TurnstileChallengeState } from "../types/TurnstileChallengeState";

/**
 * Holds the token for one `TurnstileChallenge`, as `useTurnstileToken` does on the website. Cloudflare tokens work
 * once, and the server spends one even when it then refuses the request (email taken, rate limit), so call
 * `reset()` after any failed submit, or the retry sends a spent token and is refused as expired.
 */
export function useTurnstileChallenge(siteKey: string, baseUrl: string): TurnstileChallengeState {
  const ref = useRef<TurnstileChallengeHandle>(null);
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState<string>();

  const onToken = useCallback((next: string) => {
    setToken(next);
    setProblem(undefined);
  }, []);
  const onExpire = useCallback(() => setToken(""), []);
  const reset = useCallback((next?: string) => {
    setToken("");
    setProblem(next);
    ref.current?.reset();
  }, []);

  const challengeProps = useMemo(
    () => ({ ref, siteKey, baseUrl, onToken, onExpire, error: problem }),
    [siteKey, baseUrl, onToken, onExpire, problem],
  );

  return { token, isReady: siteKey === "" || token !== "", reset, showProblem: setProblem, challengeProps };
}
