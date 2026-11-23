import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDebouncedValue } from "@platform/ui";

interface UrlSyncedSearch {
  input: string;
  setInput: (text: string) => void;
}

/**
 * A search box whose text follows `urlQuery` (the URL's ?q=) and whose typing is
 * written back through `commitQuery` once it pauses for `delayMs`.
 *
 * The URL wins when it changes on its own (browser Back or Forward), and the box
 * is left alone when the change is the box's own debounced write arriving, so a
 * pause mid-typing never rewrites what the user is still typing.
 */
export function useUrlSyncedSearch(
  urlQuery: string,
  commitQuery: (query: string) => void,
  delayMs: number,
): UrlSyncedSearch {
  const [input, setInput] = useState(urlQuery);
  const debounced = useDebouncedValue(input.trim(), delayMs);
  const lastSynced = useRef(urlQuery);
  const commit = useEffectEvent(commitQuery);

  useEffect(() => {
    if (debounced === lastSynced.current) return;
    lastSynced.current = debounced;
    commit(debounced);
  }, [debounced]);

  useEffect(() => {
    if (urlQuery === lastSynced.current) return;
    lastSynced.current = urlQuery;
    setInput(urlQuery);
  }, [urlQuery]);

  return { input, setInput };
}
