import {
  PROFESSION_DIRECTION_PARAM,
  PROFESSION_SORT_PARAM,
  PROFESSION_TIER_PARAM,
} from "@/games/wow-forever/data/professions/professionTiers/viewParams";
import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";

/** The link's `?tier=`, only when it names one of `tiers`; anything else reads as "not set". */
export function tierFromParams<T extends string>(params: URLSearchParams, tiers: readonly T[]): T | null {
  return tiers.find((t) => t === params.get(PROFESSION_TIER_PARAM)) ?? null;
}

/** The link's `?sort=` and `?dir=`, each checked against an allowlist; anything else reads as the default. */
export function sortFromParams<K extends string>(
  params: URLSearchParams,
  keys: readonly K[],
  fallback: ProfessionSort<K>,
): ProfessionSort<K> {
  const key = keys.find((k) => k === params.get(PROFESSION_SORT_PARAM)) ?? fallback.key;
  const direction = params.get(PROFESSION_DIRECTION_PARAM) === "desc" ? "desc" : fallback.direction;
  return { key, direction };
}

export function setOrDeleteParam(params: URLSearchParams, name: string, value: string | null): void {
  if (value === null) params.delete(name);
  else params.set(name, value);
}

/** Writes the tier into `params` (left out when null). */
export function tierToParams(params: URLSearchParams, tier: string | null): void {
  setOrDeleteParam(params, PROFESSION_TIER_PARAM, tier);
}

/** Writes the order into `params`, leaving out whatever is the default. */
export function sortToParams<K extends string>(params: URLSearchParams, sort: ProfessionSort<K>, fallback: ProfessionSort<K>): void {
  setOrDeleteParam(params, PROFESSION_SORT_PARAM, sort.key === fallback.key ? null : sort.key);
  setOrDeleteParam(params, PROFESSION_DIRECTION_PARAM, sort.direction === fallback.direction ? null : sort.direction);
}
