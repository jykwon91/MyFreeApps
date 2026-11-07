import { WHATS_NEW } from "@/games/wow-forever/data/whatsNew";
import { PAGE_VISITS_KEY } from "@/games/wow-forever/data/whatsNewSettings";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { parsePageVisits, withVisit } from "@/games/wow-forever/lib/whatsNew/updateDots";
import type { PageVisits } from "@/games/wow-forever/types/whatsNew/pageVisits";
import type { PageVisitStore } from "@/games/wow-forever/types/whatsNew/pageVisitStore";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

/**
 * Seen entries shared by the left nav and the hub tiles (one
 * `useSyncExternalStore` source, so clearing a dot clears it everywhere).
 * A visit re-reads storage before writing and a save in another tab reloads
 * this one, so two open tabs never undo each other's visits. Storage failures
 * are swallowed by `safeLocalStorage`: the dots then just don't survive a reload.
 */
export function createPageVisitStore(key: string, entries: readonly WhatsNewEntry[]): PageVisitStore {
  let loaded = false;
  let current: PageVisits | null = null;
  const listeners = new Set<() => void>();

  function load(): PageVisits | null {
    return readStored<PageVisits | null>(key, parsePageVisits, null);
  }

  function notify(): void {
    listeners.forEach((listener) => listener());
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== key) return;
    current = load();
    loaded = true;
    notify();
  }

  function getSnapshot(): PageVisits | null {
    if (!loaded) {
      current = load();
      loaded = true;
    }
    return current;
  }

  return {
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot,
    recordVisit(page) {
      const latest = load();
      const next = withVisit(latest, page, entries);
      if (next !== latest) writeStored(key, next);
      const changed = !loaded || JSON.stringify(next) !== JSON.stringify(current);
      loaded = true;
      if (!changed) return;
      current = next;
      notify();
    },
  };
}

export const pageVisitStore = createPageVisitStore(PAGE_VISITS_KEY, WHATS_NEW);
