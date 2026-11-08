import { useCallback, useEffect, useRef } from "react";
import { useTurnstileToken } from "@/games/wow-forever/hooks/useTurnstileToken";
import type { AskTurnstileState } from "@/games/wow-forever/types/ask/askTurnstileState";

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/**
 * One Turnstile token per question. The widget sits under the composer and
 * fetches a token in the background; a question waits for it if it hasn't
 * arrived yet, and taking it resets the widget so the next question gets its
 * own (tokens are single-use). Tool-result calls carry the ticket, not a token.
 */
export function useAskTurnstile(): AskTurnstileState {
  const widget = useTurnstileToken();
  const { token, needsToken, reset } = widget;
  const tokenRef = useRef("");
  const waitersRef = useRef<((token: string) => void)[]>([]);

  useEffect(() => {
    tokenRef.current = token;
    if (token === "") return;
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const resolve of waiters) resolve(token);
  }, [token]);

  const takeToken = useCallback(
    async (signal: AbortSignal): Promise<string> => {
      if (!needsToken) return "";
      if (signal.aborted) throw abortError();
      const next =
        tokenRef.current ||
        (await new Promise<string>((resolve, reject) => {
          const waiter = (value: string) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          };
          const onAbort = () => {
            waitersRef.current = waitersRef.current.filter((w) => w !== waiter);
            reject(abortError());
          };
          waitersRef.current.push(waiter);
          signal.addEventListener("abort", onAbort, { once: true });
        }));
      tokenRef.current = "";
      reset();
      return next;
    },
    [needsToken, reset],
  );

  return { widget, takeToken };
}
