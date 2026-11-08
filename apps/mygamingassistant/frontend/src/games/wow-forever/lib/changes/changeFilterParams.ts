import { CHANGE_CATEGORIES } from "@/games/wow-forever/data/changes/changeCategories";
import {
  CHANGE_CATEGORY_PARAM,
  CHANGE_CLASS_PARAM,
  CHANGE_QUERY_PARAM,
  CHANGE_SINCE_ON,
  CHANGE_SINCE_PARAM,
  DEFAULT_CHANGE_CATEGORY,
} from "@/games/wow-forever/data/changes/changeFeedConfig";
import { findClass } from "@/games/wow-forever/data/classes";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";

/** The filters a URL asks for; an unknown category reads as the default and an unknown class as "every class". */
export function parseChangeFilters(params: URLSearchParams): ChangeFilters {
  const category = params.get(CHANGE_CATEGORY_PARAM);
  return {
    category: CHANGE_CATEGORIES.find((c) => c === category) ?? DEFAULT_CHANGE_CATEGORY,
    classId: findClass(params.get(CHANGE_CLASS_PARAM) ?? "")?.id ?? null,
    query: params.get(CHANGE_QUERY_PARAM) ?? "",
    sinceLastBuild: params.get(CHANGE_SINCE_PARAM) === CHANGE_SINCE_ON,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** `params` with the filters written in; defaults are left out so the plain page has a plain URL. */
export function writeChangeFilters(params: URLSearchParams, filters: ChangeFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  setOrDelete(next, CHANGE_CATEGORY_PARAM, filters.category === DEFAULT_CHANGE_CATEGORY ? null : filters.category);
  setOrDelete(next, CHANGE_CLASS_PARAM, filters.classId);
  setOrDelete(next, CHANGE_QUERY_PARAM, filters.query);
  setOrDelete(next, CHANGE_SINCE_PARAM, filters.sinceLastBuild ? CHANGE_SINCE_ON : null);
  return next;
}
