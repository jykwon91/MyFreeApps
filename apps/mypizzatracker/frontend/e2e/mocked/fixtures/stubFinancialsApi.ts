/**
 * Stubs a drop's financials (app/api/financials.py): GET
 * /financials/drops/{id} answers the summary and expenses, and POST
 * /financials/drops/{id}/expenses adds an expense the next read totals in.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import type { ExpenseCreate, ExpenseRead } from "@/types/financials/financials";
import { apiPath, pathId } from "./apiPath";
import { ACTIVE_DROP_ID } from "./dropFixtures";
import { expenseFromCreate, expenseOf, financialsOf } from "./financialsFixtures";
import { recordWrite } from "./recordWrite";

const FINANCIALS = /^\/financials\/drops\/([^/]+)$/;
const EXPENSES = /^\/financials\/drops\/([^/]+)\/expenses$/;
const NOT_FOUND = { detail: "Not Found" };
const FIRST_NEW = 100;

export async function stubFinancialsApi(page: Page, expenses: ExpenseRead[] = [expenseOf(1)]): Promise<SentRequest[]> {
  const writes: SentRequest[] = [];
  let state = [...expenses];
  let created = FIRST_NEW;

  await page.route(apiPath(FINANCIALS), (route) =>
    pathId(FINANCIALS, route.request()) === ACTIVE_DROP_ID
      ? route.fulfill(json(financialsOf(state)))
      : route.fulfill(json(NOT_FOUND, 404)),
  );

  await page.route(apiPath(EXPENSES), (route) => {
    if (pathId(EXPENSES, route.request()) !== ACTIVE_DROP_ID) return route.fulfill(json(NOT_FOUND, 404));
    const expense = expenseFromCreate(created++, recordWrite(writes, route.request()) as ExpenseCreate);
    state = [...state, expense];
    return route.fulfill(json(expense, 201));
  });

  return writes;
}
