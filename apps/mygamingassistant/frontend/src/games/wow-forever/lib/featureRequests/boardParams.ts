import {
  BOARD_PARAM,
  BOARD_STATUSES_BY_FILTER,
  DEFAULT_BOARD_SORT,
  DEFAULT_BOARD_STATUS,
  SUGGEST_PAGE_PATH,
} from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { isBoardStatusFilter, isFeatureArea, isFeatureSort } from "@/games/wow-forever/lib/featureRequests/featureRequestGuards";
import { isUuid } from "@/games/wow-forever/lib/featureRequests/voterId";
import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureRequestListArgs } from "@/games/wow-forever/types/featureRequests/featureRequestListArgs";

/** The board's filters from the URL. Anything unknown falls back to the default, never an error. */
export function parseBoardFilters(params: URLSearchParams): BoardFilters {
  const status = params.get(BOARD_PARAM.status);
  const area = params.get(BOARD_PARAM.area);
  const sort = params.get(BOARD_PARAM.sort);
  const highlight = params.get(BOARD_PARAM.highlight);
  return {
    status: isBoardStatusFilter(status) ? status : DEFAULT_BOARD_STATUS,
    area: isFeatureArea(area) ? area : null,
    sort: isFeatureSort(sort) ? sort : DEFAULT_BOARD_SORT,
    highlight: isUuid(highlight) ? highlight : null,
  };
}

/**
 * `params` with the filters in `patch` applied. Defaults are left out of the URL so the plain
 * `/wow-forever/suggest` link stays clean; other query keys are kept.
 */
export function withBoardFilters(params: URLSearchParams, patch: Partial<BoardFilters>): URLSearchParams {
  const next = new URLSearchParams(params);
  const merged = { ...parseBoardFilters(params), ...patch };
  setOrDelete(next, BOARD_PARAM.status, merged.status === DEFAULT_BOARD_STATUS ? null : merged.status);
  setOrDelete(next, BOARD_PARAM.area, merged.area);
  setOrDelete(next, BOARD_PARAM.sort, merged.sort === DEFAULT_BOARD_SORT ? null : merged.sort);
  setOrDelete(next, BOARD_PARAM.highlight, merged.highlight);
  return next;
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}

/** Whether the board shows anything but its default view (so "no results" means "these filters"). */
export function isFilteredBoard(filters: BoardFilters): boolean {
  return filters.status !== DEFAULT_BOARD_STATUS || filters.area !== null;
}

export function listArgsFor(filters: BoardFilters, clientId: string): FeatureRequestListArgs {
  return {
    statuses: BOARD_STATUSES_BY_FILTER[filters.status],
    area: filters.area,
    sort: filters.sort,
    clientId,
  };
}

/** The `GET /api/wow/feature-requests` query string. Statuses repeat (`status=open&status=planned`). */
export function featureRequestListQuery(args: FeatureRequestListArgs, offset: number, limit: number): string {
  const params = new URLSearchParams();
  for (const status of args.statuses) params.append("status", status);
  if (args.area !== null) params.set("area", args.area);
  params.set("sort", args.sort);
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  params.set("client_id", args.clientId);
  return params.toString();
}

/** The suggest page, opened on one area's board (`?area=`) — or every area. */
export function suggestPagePath(area: FeatureArea | null): string {
  if (area === null) return SUGGEST_PAGE_PATH;
  return `${SUGGEST_PAGE_PATH}?${new URLSearchParams({ [BOARD_PARAM.area]: area }).toString()}`;
}
