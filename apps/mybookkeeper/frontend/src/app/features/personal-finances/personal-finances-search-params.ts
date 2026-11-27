import { isMonthText } from "@mybookkeeper/api-client/utils/monthText";
import type { PersonalFinancesQuery } from "@mybookkeeper/api-client/types/personal-finances/personal-finances-query";

/** ``?start=&end=`` read back; anything that isn't a "YYYY-MM" is left out. */
export function personalFinancesQueryFrom(params: URLSearchParams): PersonalFinancesQuery {
  const start = params.get("start");
  const end = params.get("end");
  return { start: isMonthText(start) ? start : null, end: isMonthText(end) ? end : null };
}

/** The query as URL params, leaving out what isn't set so the plain page URL stays plain. */
export function personalFinancesSearchParams(query: PersonalFinancesQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.start !== null) params.start = query.start;
  if (query.end !== null) params.end = query.end;
  return params;
}

/** January to December of ``year``. */
export function yearQuery(year: number): PersonalFinancesQuery {
  return { start: `${year}-01`, end: `${year}-12` };
}

/** The whole year ``query`` asks for, or null when it asks for something else. */
export function yearOf(query: PersonalFinancesQuery): number | null {
  if (query.start === null || query.end === null) return null;
  const year = Number(query.start.slice(0, 4));
  return query.start === `${year}-01` && query.end === `${year}-12` ? year : null;
}

/** The year a month range sits in, for "Show the whole year"; null when it spans years. */
export function yearAround(query: PersonalFinancesQuery): number | null {
  if (query.start === null || query.end === null) return null;
  const year = query.start.slice(0, 4);
  return query.end.startsWith(year) ? Number(year) : null;
}
