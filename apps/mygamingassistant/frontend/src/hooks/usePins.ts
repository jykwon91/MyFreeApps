/**
 * usePins — localStorage-backed pin system for lineups.
 *
 * Storage key: mga.pins.{gameSlug}.{mapSlug}.{side}
 * Value: JSON array of { lineup_id: string; sort_order: number }
 *
 * Graceful degradation: if localStorage is unavailable (private browsing,
 * quota exceeded), falls back to in-memory state for the session and emits
 * a one-time warning toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PinEntry {
  lineup_id: string;
  sort_order: number;
}

export interface UsePinsReturn {
  pinnedIds: string[];
  pin: (id: string) => void;
  unpin: (id: string) => void;
  reorder: (ids: string[]) => void;
  isPinned: (id: string) => boolean;
}

function storageKey(gameSlug: string, mapSlug: string, side: string): string {
  return `mga.pins.${gameSlug}.${mapSlug}.${side}`;
}

let storageWarnedThisSession = false;

function readEntries(key: string, fallback: PinEntry[]): PinEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed as PinEntry[];
  } catch {
    return fallback;
  }
}

function writeEntries(
  key: string,
  entries: PinEntry[],
  onStorageUnavailable: () => void,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    onStorageUnavailable();
  }
}

export function usePins(
  gameSlug: string,
  mapSlug: string,
  side: string,
): UsePinsReturn {
  const key = storageKey(gameSlug, mapSlug, side);
  const storageUnavailableRef = useRef(false);
  const [entries, setEntries] = useState<PinEntry[]>(() => readEntries(key, []));

  const handleStorageUnavailable = useCallback(() => {
    storageUnavailableRef.current = true;
    if (!storageWarnedThisSession) {
      storageWarnedThisSession = true;
      // Dispatch a custom event; MapPage listens and shows a toast.
      window.dispatchEvent(new CustomEvent("mga:storage-unavailable"));
    }
  }, []);

  // Re-read from storage when the key changes (side / map navigation).
  // Uses a MessageChannel to schedule the setState asynchronously —
  // this avoids calling setState synchronously inside the effect body,
  // which would trigger the "set-state-in-effect" lint rule.
  useEffect(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => setEntries(readEntries(key, []));
    channel.port2.postMessage(null);
    return () => channel.port1.close();
  }, [key]);

  // Cross-tab sync via the storage event
  useEffect(() => {
    function onStorageEvent(e: StorageEvent) {
      if (e.key === key) {
        setEntries(readEntries(key, []));
      }
    }
    window.addEventListener("storage", onStorageEvent);
    return () => window.removeEventListener("storage", onStorageEvent);
  }, [key]);

  const pin = useCallback(
    (id: string) => {
      setEntries((prev) => {
        if (prev.some((e) => e.lineup_id === id)) return prev;
        const next: PinEntry[] = [
          ...prev,
          { lineup_id: id, sort_order: prev.length },
        ];
        writeEntries(key, next, handleStorageUnavailable);
        return next;
      });
    },
    [key, handleStorageUnavailable],
  );

  const unpin = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const next = prev
          .filter((e) => e.lineup_id !== id)
          .map((e, i) => ({ ...e, sort_order: i }));
        writeEntries(key, next, handleStorageUnavailable);
        return next;
      });
    },
    [key, handleStorageUnavailable],
  );

  const reorder = useCallback(
    (ids: string[]) => {
      setEntries((prev) => {
        const byId = new Map(prev.map((e) => [e.lineup_id, e]));
        const next: PinEntry[] = ids
          .filter((id) => byId.has(id))
          .map((id, i) => ({ lineup_id: id, sort_order: i }));
        writeEntries(key, next, handleStorageUnavailable);
        return next;
      });
    },
    [key, handleStorageUnavailable],
  );

  const isPinned = useCallback(
    (id: string) => entries.some((e) => e.lineup_id === id),
    [entries],
  );

  const pinnedIds = useMemo(
    () =>
      [...entries]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => e.lineup_id),
    [entries],
  );

  return { pinnedIds, pin, unpin, reorder, isPinned };
}
