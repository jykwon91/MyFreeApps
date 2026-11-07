import type { PageVisits } from "@/games/wow-forever/types/whatsNew/pageVisits";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** A stored `PageVisits`, or null when it's missing or malformed (then it's a first visit). */
export function parsePageVisits(raw: unknown): PageVisits | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { baseline, pages } = raw as { baseline?: unknown; pages?: unknown };
  if (!isStringList(baseline)) return null;
  const kept: Record<string, readonly string[]> = {};
  if (typeof pages === "object" && pages !== null) {
    for (const [path, seen] of Object.entries(pages)) {
      if (isStringList(seen)) kept[path] = seen;
    }
  }
  return { baseline, pages: kept };
}

/** How an entry is remembered as seen: its date and title (retitling an entry shows its dot again). */
export function entryKey(entry: Pick<WhatsNewEntry, "date" | "title">): string {
  return `${entry.date}|${entry.title}`;
}

/** The page an entry belongs to: its link without the query or hash. */
export function entryPage(entry: Pick<WhatsNewEntry, "to">): string {
  return entry.to.split(/[?#]/)[0];
}

function entryKeysFor(entries: readonly WhatsNewEntry[], page: string): string[] {
  return entries.filter((entry) => entryPage(entry) === page).map(entryKey);
}

/**
 * `visits` with `page` opened now: every current entry for it counts as seen.
 * The first visit ever also marks every current entry seen, so it shows no dots.
 * Returns `visits` itself when nothing changes.
 */
export function withVisit(
  visits: PageVisits | null,
  page: string,
  entries: readonly WhatsNewEntry[],
): PageVisits {
  const seen = entryKeysFor(entries, page);
  if (!visits) return { baseline: entries.map(entryKey), pages: { [page]: seen } };
  const before = visits.pages[page];
  if (before && seen.every((key) => before.includes(key))) return visits;
  return { baseline: visits.baseline, pages: { ...visits.pages, [page]: seen } };
}

/** The pages with an entry added since the first visit that the page hasn't been opened since. */
export function pagesWithUpdates(
  entries: readonly WhatsNewEntry[],
  visits: PageVisits | null,
): ReadonlySet<string> {
  const updated = new Set<string>();
  if (!visits) return updated;
  for (const entry of entries) {
    const key = entryKey(entry);
    const page = entryPage(entry);
    if (!visits.baseline.includes(key) && !visits.pages[page]?.includes(key)) updated.add(page);
  }
  return updated;
}

/**
 * Which dot-carrying page a location counts as a visit to: the page itself or
 * anything under it (`/wow-forever/food/123` is the food page). The hub counts
 * only exactly, or every WoW page would be a hub visit.
 */
export function pageForPathname(pathname: string, pages: readonly string[], hubPath: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === hubPath) return hubPath;
  return pages.find((page) => page !== hubPath && (path === page || path.startsWith(`${page}/`))) ?? null;
}
