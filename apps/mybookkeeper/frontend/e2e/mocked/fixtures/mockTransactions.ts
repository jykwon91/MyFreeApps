/**
 * GET /transactions/page, the Transactions page's list, answered from `rows`
 * one page at a time: the rows the request's status filters keep (the filter
 * bar's `status` and the header's `statuses`), sliced to the page its limit and
 * offset ask for, with the total they match. The "empty" catch-all's `[]` is not
 * a page, so a spec that lands on /transactions registers this (with no rows for
 * an empty list). GET /transactions/selection answers with the same matching rows.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";

interface MockRow {
  id: string;
  property_id: string | null;
  status: string;
}

function matching<T extends MockRow>(rows: readonly T[], params: URLSearchParams): readonly T[] {
  const status = params.get("status");
  const statuses = params.getAll("statuses");
  return rows.filter((row) => (!status || row.status === status) && (!statuses.length || statuses.includes(row.status)));
}

/** The query string of every list request, in order, so a spec can check what was asked for. */
export async function stubTransactionPages<T extends MockRow>(
  page: Page,
  rows: readonly T[],
): Promise<URLSearchParams[]> {
  const requests: URLSearchParams[] = [];
  await page.route(/\/api\/transactions\/page(\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const kept = matching(rows, params);
    const offset = Number(params.get("offset") ?? 0);
    const items = kept.slice(offset, offset + Number(params.get("limit") ?? kept.length));
    return route.fulfill(json({ items, total: kept.length, has_more: offset + items.length < kept.length }));
  });
  return requests;
}

/** The query string of every selection request, in order: "select all", and the check after a filter change. */
export async function stubTransactionSelection<T extends MockRow>(
  page: Page,
  rows: readonly T[],
): Promise<URLSearchParams[]> {
  const requests: URLSearchParams[] = [];
  await page.route(/\/api\/transactions\/selection(\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    return route.fulfill(json(matching(rows, params).map(({ id, property_id, status }) => ({ id, property_id, status }))));
  });
  return requests;
}
