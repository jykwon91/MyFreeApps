import {
  PROFESSION_SEARCH_MAX_LENGTH,
  PROFESSION_SEARCH_PARAM,
} from "@/games/wow-forever/data/professions/professionTiers/viewParams";
import { setOrDeleteParam } from "@/games/wow-forever/lib/professionTiers/viewParams";

/** The link's `?q=`, trimmed and cut to the box's length; "" when not set. */
export function searchFromParams(params: URLSearchParams): string {
  return (params.get(PROFESSION_SEARCH_PARAM) ?? "").trim().slice(0, PROFESSION_SEARCH_MAX_LENGTH);
}

/** Writes the search into `params` (left out when empty). */
export function searchToParams(params: URLSearchParams, query: string): void {
  setOrDeleteParam(params, PROFESSION_SEARCH_PARAM, query === "" ? null : query);
}
