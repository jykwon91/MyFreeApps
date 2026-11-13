/**
 * Holds, fails or logs reads in front of a stub. For E2E tests only.
 *
 * Register these AFTER the stub: Playwright tries the most recently added
 * route first, and route.fallback() hands the request on to the stub.
 */
import type { Page } from "@playwright/test";
import { INTERNAL_SERVER_ERROR } from "./constants/internalServerError";
import { createGate } from "./gate";
import { plainText } from "./mockResponse";
import type { Gate } from "./types/Gate";
import type { LoggedRead } from "./types/LoggedRead";
import type { RouteMatcher } from "./types/RouteMatcher";

/** Holds every GET `matches` accepts until the returned gate is released. */
export async function holdReads(page: Page, matches: RouteMatcher): Promise<Gate> {
  const gate = createGate();
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET") await gate.wait;
    await route.fallback();
  });
  return gate;
}

/** Answers the first `times` GETs `matches` accepts with an unhandled 500; later ones reach the stub. */
export async function failReads(page: Page, matches: RouteMatcher, times = 1): Promise<void> {
  let left = times;
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET" && left > 0) {
      left -= 1;
      return route.fulfill(plainText(INTERNAL_SERVER_ERROR, 500));
    }
    return route.fallback();
  });
}

/**
 * Logs every GET `matches` accepts, with when it arrived, and passes it on, so
 * a spec can tell how many reads an action caused and how soon. Register it
 * last, so it sees the reads holdReads and failReads then handle.
 */
export async function logReads(page: Page, matches: RouteMatcher): Promise<LoggedRead[]> {
  const reads: LoggedRead[] = [];
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET") reads.push({ url: route.request().url(), at: Date.now() });
    await route.fallback();
  });
  return reads;
}
