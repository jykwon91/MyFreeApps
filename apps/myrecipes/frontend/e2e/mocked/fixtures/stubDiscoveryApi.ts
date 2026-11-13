/**
 * Stubs the discovery endpoints the way the backend answers them (apps/myrecipes/backend
 * tests/test_recipe_discovery.py pins the shapes): POST /discovery/search answers the results,
 * POST /discovery/detail the read of the recipe asked for (422 for a url it has no read of), and
 * GET /discovery/image a pixel. Statuses answer in turn so a failure can be followed by a retry,
 * and `held` keeps those calls' answers back until release() so the loading state can be looked at.
 */
import type { Page } from "@playwright/test";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";
import { json } from "@platform/ui/test-support/mockResponse";
import type { DiscoveryApiLog } from "../types/DiscoveryApiLog";
import type { DiscoveryApiStubOptions } from "../types/DiscoveryApiStubOptions";
import type { DiscoveryReadRequest } from "../types/DiscoveryReadRequest";
import { DISCOVERY_RESULTS, NAPOLITANO_DETAIL, PIXEL_PNG } from "./discoveryFixtures";

const SEARCH_ROUTE = new RegExp(`${DEFAULT_API_BASE}/discovery/search$`);
const DETAIL_ROUTE = new RegExp(`${DEFAULT_API_BASE}/discovery/detail$`);
const IMAGE_ROUTE = new RegExp(`${DEFAULT_API_BASE}/discovery/image(\\?|$)`);
const OK = 200;
const UNREADABLE = 422;

export async function stubDiscoveryApi(
  page: Page,
  { searchStatuses = [], readStatuses = [], held = [] }: DiscoveryApiStubOptions = {},
): Promise<DiscoveryApiLog> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const log: DiscoveryApiLog = { searches: [], reads: [], release: () => release() };

  await page.route(IMAGE_ROUTE, (route) => route.fulfill({ status: OK, contentType: "image/png", body: PIXEL_PNG }));
  await page.route(SEARCH_ROUTE, async (route) => {
    log.searches.push((route.request().postDataJSON() as { query: string }).query);
    if (held.includes("search")) await gate;
    const status = searchStatuses[log.searches.length - 1] ?? OK;
    return route.fulfill(status === OK ? json(DISCOVERY_RESULTS) : json({ detail: "no" }, status));
  });
  await page.route(DETAIL_ROUTE, async (route) => {
    const body = route.request().postDataJSON() as DiscoveryReadRequest;
    log.reads.push(body);
    if (held.includes("read")) await gate;
    const status = readStatuses[log.reads.length - 1] ?? OK;
    if (status !== OK) return route.fulfill(json({ detail: "no" }, status));
    return route.fulfill(
      body.url === NAPOLITANO_DETAIL.url ? json(NAPOLITANO_DETAIL) : json({ detail: "unreadable" }, UNREADABLE),
    );
  });
  return log;
}
