/**
 * Holds or fails one read in front of a stub. Register these AFTER the stub:
 * Playwright tries the most recently added route first, and route.fallback()
 * hands the request on to the stub.
 */
import type { Page } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { plainText } from "@platform/ui/test-support/mockResponse";
import type { Gate } from "@platform/ui/test-support/types/Gate";
import { INTERNAL_ERROR } from "../constants/refusalDetails";

type UrlMatcher = (url: URL) => boolean;

/** Holds every GET `matches` accepts until the returned gate is released. */
export async function holdReads(page: Page, matches: UrlMatcher): Promise<Gate> {
  const gate = createGate();
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET") await gate.wait;
    await route.fallback();
  });
  return gate;
}

/** Answers the first `times` GETs `matches` accepts with an unhandled 500; later ones reach the stub. */
export async function failReads(page: Page, matches: UrlMatcher, times = 1): Promise<void> {
  let left = times;
  await page.route(matches, async (route) => {
    if (route.request().method() === "GET" && left > 0) {
      left -= 1;
      return route.fulfill(plainText(INTERNAL_ERROR, 500));
    }
    return route.fallback();
  });
}
