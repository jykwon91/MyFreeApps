/**
 * No-backend E2E for running a company's research once: leaving the company
 * mid-run and reopening it shows the run still going (no Run research button
 * to start a second, paid run), and the one run's result lands. A 409 from
 * the server (the research already running from another tab or device) says
 * so instead of "Research failed".
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import type { Gate } from "@platform/ui/test-support/types/Gate";
import { COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import { mockCompany, mockCompanyResearch } from "./fixtures/mockData";

const COMPANY = mockCompany();
const RESEARCH_ENDPOINT = new RegExp(`/api/companies/${COMPANY.id}/research$`);
const RESEARCH = mockCompanyResearch({ green_flags: ["Good pay"] });

interface ResearchStub {
  posts: number;
  researched: boolean;
}

/** Stubs the company pages; POST /research answers `postStatus`, held until `gate` (if any) opens. */
async function stubCompany(page: Page, postStatus: 200 | 409 | 502, gate?: Gate): Promise<ResearchStub> {
  const stub: ResearchStub = { posts: 0, researched: false };
  await page.route(RESEARCH_ENDPOINT, async (route) => {
    if (route.request().method() === "POST") {
      stub.posts += 1;
      if (gate) await gate.wait;
      if (postStatus === 409) {
        return route.fulfill(json({ detail: "Research for this company is already running" }, 409));
      }
      if (postStatus === 502) return route.fulfill(json({ detail: "AI synthesis failed" }, 502));
      stub.researched = true;
      return route.fulfill(json(RESEARCH));
    }
    return stub.researched
      ? route.fulfill(json(RESEARCH))
      : route.fulfill(json({ detail: "No research has been run for this company yet" }, 404));
  });
  await page.route(new RegExp(`/api/companies/${COMPANY.id}$`), (route) => route.fulfill(json(COMPANY)));
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(/\/api\/companies(\?|$)/, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  return stub;
}

test("reopening the company mid-run shows the run going, and only one run is started", async ({ page }) => {
  await stubSignedInShell(page);
  const gate = createGate();
  const stub = await stubCompany(page, 200, gate);

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect.poll(() => stub.posts).toBe(1);

  // Leave and come back while the run is in flight.
  await reopenCompany(page);
  await expect(page.getByRole("button", { name: "Run research" })).toHaveCount(0);

  gate.release();
  await expect(page.getByRole("button", { name: "Re-run" })).toBeVisible();
  expect(stub.posts).toBe(1);
});

test("a run refused because it's already running says so, with Retry", async ({ page }) => {
  await stubSignedInShell(page);
  await stubCompany(page, 409);

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Run research" }).click();

  await expect(toast(page, COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE)).toBeVisible();
  await expect(page.getByText(COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

/** Leaves the company for the Companies list and opens it again, in the app (the store survives). */
async function reopenCompany(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Companies" }).first().click();
  await expect(page).toHaveURL(/\/companies$/);
  await page.getByText(COMPANY.name, { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/companies/${COMPANY.id}$`));
  await expect(page.getByRole("heading", { name: "AI Research" })).toBeVisible();
}

test("reopening a company after a failed run doesn't show the old failure", async ({ page }) => {
  await stubSignedInShell(page);
  await stubCompany(page, 502);

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await reopenCompany(page);
  // The failure's toast may still be fading; the research panel itself is back to its first state.
  const panel = page.locator("section", { has: page.getByRole("heading", { name: "AI Research" }) });
  await expect(panel.getByRole("button", { name: "Run research" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(panel.getByText(/AI synthesis failed/)).toHaveCount(0);
});
