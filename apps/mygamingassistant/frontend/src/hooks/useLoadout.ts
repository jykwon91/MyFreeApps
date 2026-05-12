/**
 * useLoadout — localStorage-backed per-(game, side) loadout filter.
 *
 * Storage key: mga.loadout.{gameSlug}.{side}
 * Value: JSON array of utility_type slugs in the player's current loadout.
 *
 * Usage:
 *   const { loadout, setLoadout, clearLoadout } = useLoadout(gameSlug, side);
 *
 * Intersection logic (used in MapPage):
 *   - If loadout is non-empty AND utility chips are selected:
 *       show lineups where utility_type.slug is in (loadout ∩ selectedUtils)
 *   - If loadout is non-empty but no utility chips selected:
 *       show lineups where utility_type.slug is in loadout
 *   - If loadout is empty:
 *       existing utility chip filter applies (no change from pre-PR6 behavior)
 *
 * Separate per-side because CS2 attackers/defenders typically buy different
 * utility (T-side smokes vs CT-side flashes, etc.).
 *
 * Graceful degradation: if localStorage is unavailable, falls back to
 * in-memory state for the session (same pattern as usePins).
 */
import { useCallback, useEffect, useState } from "react";

function storageKey(gameSlug: string, side: string): string {
  return `mga.loadout.${gameSlug}.${side}`;
}

function readLoadout(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeLoadout(key: string, slugs: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(slugs));
  } catch {
    // Graceful degradation — in-memory state is already updated
  }
}

export interface UseLoadoutReturn {
  /** Current loadout utility slugs. Empty = no loadout filter applied. */
  loadout: string[];
  /** Replace the entire loadout with new slugs. */
  setLoadout: (slugs: string[]) => void;
  /** Toggle a single utility slug in/out of the loadout. */
  toggleLoadout: (slug: string) => void;
  /** Clear the loadout entirely. */
  clearLoadout: () => void;
}

export function useLoadout(gameSlug: string, side: string): UseLoadoutReturn {
  const key = storageKey(gameSlug, side);
  const [loadout, setLoadoutState] = useState<string[]>(() => readLoadout(key));

  // Re-read from storage when the key changes (side / game navigation).
  // Uses a MessageChannel to schedule the setState asynchronously —
  // same pattern as usePins to satisfy the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => setLoadoutState(readLoadout(key));
    channel.port2.postMessage(null);
    return () => channel.port1.close();
  }, [key]);

  const setLoadout = useCallback(
    (slugs: string[]) => {
      const deduped = [...new Set(slugs)];
      writeLoadout(key, deduped);
      setLoadoutState(deduped);
    },
    [key],
  );

  const toggleLoadout = useCallback(
    (slug: string) => {
      setLoadoutState((prev) => {
        const next = prev.includes(slug)
          ? prev.filter((s) => s !== slug)
          : [...prev, slug];
        writeLoadout(key, next);
        return next;
      });
    },
    [key],
  );

  const clearLoadout = useCallback(() => {
    writeLoadout(key, []);
    setLoadoutState([]);
  }, [key]);

  return { loadout, setLoadout, toggleLoadout, clearLoadout };
}

/**
 * computeEffectiveUtilFilter — pure function for intersection logic.
 *
 * @param loadout - slugs in current loadout ([] = no loadout set)
 * @param selectedUtils - slugs selected via utility chips ([] = all)
 * @returns slugs to actually filter by, or [] meaning "no filter" (show all)
 */
export function computeEffectiveUtilFilter(
  loadout: string[],
  selectedUtils: string[],
): string[] {
  if (loadout.length === 0 && selectedUtils.length === 0) {
    // No filter at all — show everything
    return [];
  }
  if (loadout.length === 0) {
    // Only utility chips active — existing behavior
    return selectedUtils;
  }
  if (selectedUtils.length === 0) {
    // Only loadout set — filter to loadout utilities
    return loadout;
  }
  // Both set — intersection
  const loadoutSet = new Set(loadout);
  const intersection = selectedUtils.filter((s) => loadoutSet.has(s));
  // If intersection is empty (player doesn't have any of the chip-filtered
  // utilities in their loadout), show nothing (strict intersection)
  return intersection;
}
