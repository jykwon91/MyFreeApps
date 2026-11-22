/**
 * No-backend E2E: a research load that fails (a network blip, a 500) offers "Try again", which
 * reads the research again. It must never start a run, which is a paid AI call. A finished run
 * toasts that the research is ready.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { COMPANY_RESEARCH_READY_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import { mockCompany, mockCompanyResearch } from "./fixtures/mockData";

const COMPANY = mockCompany();
const RESEARCH_ENDPOINT = new RegExp(`/api/companies/${COMPANY.id}/research$`);
const RESEARCH = mockCompanyResearch({ green_flags: ["Good pay"] });

interface ResearchStub {
  gets: number;
  posts: number;
  /** While false, reading the research fails with a 500. */
  healthy: boolean;
}

/** GET /research answers 500 until `stub.healthy` is set, then the research; POST /research answers it too. */
async function stubCompany(page: Page, healthy: boolean): Promise<ResearchStub> {
  const stub: ResearchStub = { gets: 0, posts: 0, healthy };
  await page.route(RESEARCH_ENDPOINT, (route) => {
    if (route.request().method() === "POST") {
      stub.posts += 1;
      return route.fulfill(json(RESEARCH));
    }
    stub.gets += 1;
    return stub.healthy
      ? route.fulfill(json(RESEARCH))
      : route.fulfill(json({ detail: "Server error" }, 500));
  });
  await page.route(new RegExp(`/api/companies/${COMPANY.id}$`), (route) => route.fulfill(json(COMPANY)));
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(/\/api\/companies(\?|$)/, (route) => route.fulfill(json({ items: [COMPANY], total: 1 })));
  return stub;
}

test("a failed load's Try again reads the research again and starts no run", async ({ page }) => {
  await stubSignedInShell(page);
  const stub = await stubCompany(page, false);

  await page.goto(`/companies/${COMPANY.id}`);
  await expect(page.getByText("Couldn't load the research.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run research" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);

  const getsBefore = stub.gets;
  stub.healthy = true;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("button", { name: "Re-run" })).toBeVisible();
  expect(stub.gets).toBeGreaterThan(getsBefore);
  expect(stub.posts).toBe(0);
});

test("a finished run toasts that the research is ready", async ({ page }) => {
  await stubSignedInShell(page);
  const stub = await stubCompany(page, true);
  // No research yet: the first read says so.
  await page.unroute(RESEARCH_ENDPOINT);
  let researched = false;
  await page.route(RESEARCH_ENDPOINT, (route) => {
    if (route.request().method() === "POST") {
      stub.posts += 1;
      researched = true;
      return route.fulfill(json(RESEARCH));
    }
    return researched
      ? route.fulfill(json(RESEARCH))
      : route.fulfill(json({ detail: "No research has been run for this company yet" }, 404));
  });

  await page.goto(`/companies/${COMPANY.id}`);
  await page.getByRole("button", { name: "Run research" }).click();

  await expect(toast(page, COMPANY_RESEARCH_READY_MESSAGE)).toBeVisible();
  expect(stub.posts).toBe(1);
});
