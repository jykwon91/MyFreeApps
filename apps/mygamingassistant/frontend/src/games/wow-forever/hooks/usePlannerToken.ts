/**
 * The leader's planner token for a raid (`/wow-forever/raids/:webId/plan#k=<token>`).
 *
 * It arrives in the link's fragment, which is never sent to a server or written to a log. On first read it moves to
 * this tab's sessionStorage — memory, when storage is blocked — and leaves the address bar, so a copied address or a
 * screenshot doesn't carry it. A reload of the tab finds it again; a new tab doesn't, by design: the link is the
 * leader's own, and pressing [Groups] again mints a new one.
 */
import { useMemo } from "react";
import {
  PLANNER_TOKEN_HASH_KEY,
  PLANNER_TOKEN_PATTERN,
  PLANNER_TOKEN_STORAGE_PREFIX,
} from "@/games/wow-forever/data/raidPlanner";

/** Where tokens go when sessionStorage throws (a third-party iframe with storage blocked). */
const tokensInMemory = new Map<string, string>();

/** The raid's planner token in this tab, or null when it has none. */
export function usePlannerToken(webId: string): string | null {
  // Taking it is safe to repeat: once the fragment is gone, it's read back from this tab's keeping.
  return useMemo(() => takePlannerToken(webId), [webId]);
}

/** Moves a token in the address bar's fragment into this tab's keeping, and returns whichever the tab has. */
export function takePlannerToken(webId: string): string | null {
  const key = PLANNER_TOKEN_STORAGE_PREFIX + webId;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (fragment.has(PLANNER_TOKEN_HASH_KEY)) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    const token = fragment.get(PLANNER_TOKEN_HASH_KEY) ?? "";
    if (PLANNER_TOKEN_PATTERN.test(token)) {
      keep(key, token);
      return token;
    }
  }
  return kept(key);
}

function keep(key: string, token: string): void {
  tokensInMemory.set(key, token);
  try {
    window.sessionStorage.setItem(key, token);
  } catch {
    // Storage is blocked: memory holds it for this page.
  }
}

function kept(key: string): string | null {
  const token = readSession(key) ?? tokensInMemory.get(key);
  if (token === undefined || !PLANNER_TOKEN_PATTERN.test(token)) return null;
  return token;
}

function readSession(key: string): string | undefined {
  try {
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
