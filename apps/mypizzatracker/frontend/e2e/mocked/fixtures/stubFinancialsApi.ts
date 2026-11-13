/**
 * Stubs the drops' financials (app/api/financials.py): GET
 * /financials/drops/{id} answers that drop's summary and expenses, and POST
 * /financials/drops/{id}/expenses adds an expense the next read totals in. A
 * drop it doesn't know is 404.
 */
import type { Page } from "@playwright/test";
import { apiPath, pathId } from "@platform/ui/test-support/apiPath";
import { json } from "@platform/ui/test-support/mockResponse";
import { recordWrite } from "@platform/ui/test-support/recordWrite";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import type { ExpenseCreate, ExpenseRead } from "@/types/financials/financials";
import { sampleDrops } from "./dropFixtures";
import { expenseFromCreate, expenseOf, financialsOf } from "./financialsFixtures";

const FINANCIALS = /^\/financials\/drops\/([^/]+)$/;
const EXPENSES = /^\/financials\/drops\/([^/]+)\/expenses$/;
const NOT_FOUND = { detail: "Not Found" };
const FIRST_NEW = 100;

export async function stubFinancialsApi(page: Page, expenses: ExpenseRead[] = [expenseOf(1)]): Promise<SentRequest[]> {
  const writes: SentRequest[] = [];
  const drops = sampleDrops();
  let state = [...expenses];
  let created = FIRST_NEW;

  await page.route(apiPath(FINANCIALS), (route) => {
    const drop = drops.find((d) => d.id === pathId(FINANCIALS, route.request()));
    return route.fulfill(drop ? json(financialsOf(drop, state)) : json(NOT_FOUND, 404));
  });

  await page.route(apiPath(EXPENSES), (route) => {
    const drop = drops.find((d) => d.id === pathId(EXPENSES, route.request()));
    if (!drop) return route.fulfill(json(NOT_FOUND, 404));
    const expense = expenseFromCreate(created++, drop.id, recordWrite(writes, route.request()) as ExpenseCreate);
    state = [...state, expense];
    return route.fulfill(json(expense, 201));
  });

  return writes;
}
