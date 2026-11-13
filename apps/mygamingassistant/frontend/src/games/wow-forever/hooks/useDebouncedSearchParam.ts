import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DebouncedSearchParam } from "@/games/wow-forever/types/debouncedSearchParam";

/**
 * A search box kept in `?{param}=`: the trimmed text is written once typing pauses for
 * `delayMs`, replacing the history entry (so Back isn't a keystroke) and keeping the other params.
 */
export function useDebouncedSearchParam(param: string, delayMs: number): DebouncedSearchParam {
  const [params, setParams] = useSearchParams();
  const value = params.get(param) ?? "";
  const [text, setText] = useState(value);
  const [urlValue, setUrlValue] = useState(value);

  // The URL can change underneath (a link, Back): follow it — but not our own
  // trimmed write, or "linen " would lose its space mid-typing.
  if (value !== urlValue) {
    setUrlValue(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === value) return undefined;
    const timer = window.setTimeout(
      () =>
        setParams(
          (current) => {
            const updated = new URLSearchParams(current);
            if (next) updated.set(param, next);
            else updated.delete(param);
            return updated;
          },
          { replace: true },
        ),
      delayMs,
    );
    return () => window.clearTimeout(timer);
  }, [text, value, param, delayMs, setParams]);

  return { text, setText, value };
}
