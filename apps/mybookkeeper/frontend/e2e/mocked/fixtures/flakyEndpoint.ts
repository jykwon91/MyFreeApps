import type { Page } from "@playwright/test";
import { json } from "./mockResponse";
import type { FlakyEndpoint } from "../types/flaky-endpoint";

/**
 * Answers GET ``pattern`` with 500 until ``recover`` is called. After that its
 * loads wait until ``release`` is called, then answer with ``body``.
 *
 * Holding the recovered answer lets a spec check the state while a Retry is in
 * flight, which is when RTK has cleared ``isError`` but has no data yet.
 */
export async function failUntilRecovered(page: Page, pattern: RegExp, body: unknown): Promise<FlakyEndpoint> {
  let failing = true;
  let loads = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    loads += 1;
    if (failing) return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    await released;
    return route.fulfill(json(body));
  });
  return {
    recover: () => {
      failing = false;
    },
    release,
    loads: () => loads,
  };
}
