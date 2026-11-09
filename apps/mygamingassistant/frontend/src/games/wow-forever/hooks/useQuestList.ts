import { useCallback, useMemo } from "react";
import { DEFAULT_QUEST_FILTER, parseQuestFilter, writeQuestFilter } from "@/games/wow-forever/lib/quests/questFilterParams";
import type { QuestFilter } from "@/games/wow-forever/types/quests/questFilter";
import { useLiveSearchParams } from "@platform/ui";

const PAGE_PARAM = "pages";
const DEFAULT_PAGES = 1;

function readPages(params: URLSearchParams): number {
  const raw = params.get(PAGE_PARAM);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGES;
}

/**
 * The quest list page's URL-bound state: search query, filters, and "Show more" pages.
 * All changes replace history; a new query or filter resets to page 1.
 */
export function useQuestList(): {
  filter: QuestFilter;
  pages: number;
  updateFilter: (patch: Partial<QuestFilter>) => void;
  resetFilters: () => void;
  showMore: () => void;
} {
  const [params, setParams] = useLiveSearchParams();
  const filter = useMemo(() => parseQuestFilter(params), [params]);
  const pages = useMemo(() => readPages(params), [params]);

  const write = useCallback(
    (next: (f: QuestFilter, p: number) => { filter: QuestFilter; pages: number }) => {
      setParams((prev) => {
        const current = parseQuestFilter(prev);
        const currentPages = readPages(prev);
        const { filter: newFilter, pages: newPages } = next(current, currentPages);
        const out = writeQuestFilter(newFilter);
        if (newPages > 1) out.set(PAGE_PARAM, String(newPages));
        return out;
      }, { replace: true });
    },
    [setParams],
  );

  const updateFilter = useCallback(
    (patch: Partial<QuestFilter>) =>
      write((f) => ({ filter: { ...f, ...patch }, pages: DEFAULT_PAGES })),
    [write],
  );

  const resetFilters = useCallback(
    () => write((f) => ({ filter: { ...DEFAULT_QUEST_FILTER, q: f.q }, pages: DEFAULT_PAGES })),
    [write],
  );

  const showMore = useCallback(
    () => write((f, p) => ({ filter: f, pages: p + 1 })),
    [write],
  );

  return { filter, pages, updateFilter, resetFilters, showMore };
}
