/** The triage screen's URL state: `?tab=`, the All requests filters, and which sheet is open. Pure. */
import { FEATURE_AREAS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import { TRIAGE_PARAM } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_SHEET_KINDS, TRIAGE_SORTS, TRIAGE_STATUS_FILTERS, TRIAGE_TABS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import type { TriageListFilters } from "@/games/wow-forever/types/featureRequests/triage/triageListFilters";
import type { TriageOpenSheet } from "@/games/wow-forever/types/featureRequests/triage/triageOpenSheet";
import type { TriageSheetKind } from "@/games/wow-forever/types/featureRequests/triage/triageSheetKind";
import type { TriageTab } from "@/games/wow-forever/types/featureRequests/triage/triageTab";

export const DEFAULT_TRIAGE_FILTERS: TriageListFilters = { status: "open", area: null, sort: "top" };

const SHEET_PARAM: Readonly<Record<TriageSheetKind, string>> = {
  edit: TRIAGE_PARAM.edit,
  merge: TRIAGE_PARAM.merge,
  shipped: TRIAGE_PARAM.shipped,
  not_planned: TRIAGE_PARAM.notPlanned,
};

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | null {
  return values.find((v) => v === raw) ?? null;
}

export function parseTriageTab(params: URLSearchParams): TriageTab {
  return oneOf(TRIAGE_TABS, params.get(TRIAGE_PARAM.tab)) ?? "inbox";
}

export function parseTriageFilters(params: URLSearchParams): TriageListFilters {
  return {
    status: oneOf(TRIAGE_STATUS_FILTERS, params.get(TRIAGE_PARAM.status)) ?? DEFAULT_TRIAGE_FILTERS.status,
    area: oneOf(FEATURE_AREAS, params.get(TRIAGE_PARAM.area)),
    sort: oneOf(TRIAGE_SORTS, params.get(TRIAGE_PARAM.sort)) ?? DEFAULT_TRIAGE_FILTERS.sort,
  };
}

export function parseOpenSheet(params: URLSearchParams): TriageOpenSheet | null {
  for (const kind of TRIAGE_SHEET_KINDS) {
    const storyId = params.get(SHEET_PARAM[kind]);
    if (storyId !== null && storyId !== "") return { kind, storyId, fromSubmissionId: params.get(TRIAGE_PARAM.from) };
  }
  return null;
}

/** A copy of `params` with the filters set (defaults left out of the URL). */
export function withTriageFilters(params: URLSearchParams, patch: Partial<TriageListFilters>): URLSearchParams {
  const next = new URLSearchParams(params);
  const filters = { ...parseTriageFilters(params), ...patch };
  const set = (key: string, value: string | null, fallback: string | null) => {
    if (value === null || value === fallback) next.delete(key);
    else next.set(key, value);
  };
  set(TRIAGE_PARAM.status, filters.status, DEFAULT_TRIAGE_FILTERS.status);
  set(TRIAGE_PARAM.area, filters.area, null);
  set(TRIAGE_PARAM.sort, filters.sort, DEFAULT_TRIAGE_FILTERS.sort);
  return next;
}

export function withTriageTab(params: URLSearchParams, tab: TriageTab): URLSearchParams {
  const next = withoutSheet(params);
  if (tab === "inbox") next.delete(TRIAGE_PARAM.tab);
  else next.set(TRIAGE_PARAM.tab, tab);
  return next;
}

export function withSheet(params: URLSearchParams, sheet: TriageOpenSheet): URLSearchParams {
  const next = withoutSheet(params);
  next.set(SHEET_PARAM[sheet.kind], sheet.storyId);
  if (sheet.fromSubmissionId !== null) next.set(TRIAGE_PARAM.from, sheet.fromSubmissionId);
  return next;
}

export function withoutSheet(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const kind of TRIAGE_SHEET_KINDS) next.delete(SHEET_PARAM[kind]);
  next.delete(TRIAGE_PARAM.from);
  return next;
}
