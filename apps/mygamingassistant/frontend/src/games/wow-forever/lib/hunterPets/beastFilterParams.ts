import {
  BEAST_FAMILY_PARAM,
  BEAST_QUERY_PARAM,
  BEAST_SORT,
  BEAST_SORT_PARAM,
  DEFAULT_BEAST_SORT,
} from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { BeastFilters } from "@/games/wow-forever/types/hunterPets/beastFilters";
import type { BeastSort } from "@/games/wow-forever/types/hunterPets/beastSort";

const SORTS: readonly string[] = Object.values(BEAST_SORT);

function parseSort(raw: string | null): BeastSort {
  return raw !== null && SORTS.includes(raw) ? (raw as BeastSort) : DEFAULT_BEAST_SORT;
}

export function parseBeastFilters(params: URLSearchParams): BeastFilters {
  return {
    family: params.get(BEAST_FAMILY_PARAM) || null,
    query: params.get(BEAST_QUERY_PARAM) ?? "",
    sort: parseSort(params.get(BEAST_SORT_PARAM)),
  };
}

/** The params for these filters; defaults are left out. */
export function writeBeastFilters(filters: BeastFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  next.delete(BEAST_FAMILY_PARAM);
  next.delete(BEAST_QUERY_PARAM);
  next.delete(BEAST_SORT_PARAM);
  if (filters.family) next.set(BEAST_FAMILY_PARAM, filters.family);
  if (filters.query.trim()) next.set(BEAST_QUERY_PARAM, filters.query);
  if (filters.sort !== DEFAULT_BEAST_SORT) next.set(BEAST_SORT_PARAM, filters.sort);
  return next;
}
