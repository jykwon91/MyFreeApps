/**
 * The documents list as GET /documents/page and GET /documents/selection answer it, for no-backend specs:
 * a page of `limit` from `offset` with the total, narrowed by status the way the server narrows it.
 */
import type { Page, Route } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";

/** Any row with at least an id and a status; specs add whatever fields their screen reads. */
export interface MockDocumentRow {
  id: string;
  status: string;
  [field: string]: unknown;
}

/** What the page asked the stubbed endpoints, in order. */
export interface MockDocumentRequests {
  pages: URLSearchParams[];
  selections: URLSearchParams[];
}

/** Where the rows come from: a fixed list, or one worked out per request (for a spec that changes them). */
export type MockDocumentRows = readonly MockDocumentRow[] | ((url: URL) => readonly MockDocumentRow[]);

function matching(rows: MockDocumentRows, url: URL): MockDocumentRow[] {
  const statuses = url.searchParams.getAll("statuses");
  const all = typeof rows === "function" ? rows(url) : rows;
  return all.filter((row) => !statuses.length || statuses.includes(row.status));
}

function answerPage(route: Route, rows: MockDocumentRows): Promise<void> {
  const url = new URL(route.request().url());
  const found = matching(rows, url);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? found.length);
  const items = found.slice(offset, offset + limit);
  return route.fulfill(json({ items, total: found.length, has_more: offset + items.length < found.length }));
}

/** Answers the paged documents list and "select all" from `rows`; returns each request's query, in order. */
export async function stubDocumentPages(page: Page, rows: MockDocumentRows): Promise<MockDocumentRequests> {
  const requests: MockDocumentRequests = { pages: [], selections: [] };
  await page.route("**/api/documents/page?*", (route) => {
    requests.pages.push(new URL(route.request().url()).searchParams);
    return answerPage(route, rows);
  });
  await page.route("**/api/documents/selection*", (route) => {
    const url = new URL(route.request().url());
    requests.selections.push(url.searchParams);
    return route.fulfill(json(matching(rows, url).map(({ id, status }) => ({ id, status }))));
  });
  return requests;
}
