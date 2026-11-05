import itemsUrl from "@/games/wow-forever/data/items/items.json?url";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import type { ClientItemFile } from "@/games/wow-forever/types/clientItemFile";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";

// ~600 KB (~100 KB gzipped), served from this site as a hashed asset and
// fetched the first time the item search is shown, then shared by every card.
// Fetched rather than imported so no JS chunk (and not the type checker)
// carries it.
let pending: Promise<ClientItemList> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Item list request failed: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchList(): Promise<ClientItemList> {
  const [items, suffix] = await Promise.all([
    fetchJson<ClientItemFile>(itemsUrl),
    // Tiny, so a normal lazy chunk (an asset this small would be inlined as a data: URL).
    import("@/games/wow-forever/data/items/classic/randomSuffixItems.json"),
  ]);
  return decodeClientItems(items, suffix.default.ids);
}

/** The item list, loaded once. A failed load is forgotten so the next call tries again. */
export function loadClientItems(): Promise<ClientItemList> {
  if (!pending) {
    pending = fetchList().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

/** Start loading in the background; a failure shows when the search asks for the list. */
export function prefetchClientItems(): void {
  loadClientItems().catch(() => undefined);
}
