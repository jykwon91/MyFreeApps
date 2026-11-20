/**
 * No-backend E2E for finishing a Gmail connection in the popup, signed in.
 *
 * Fully mocks the API via route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Google's answer comes back to the website's /oauth-callback page in the popup
 * (here the connect address points straight at it). The popup finishes the
 * connection with POST /integrations/gmail/complete, which the server only
 * accepts from the person who started it, then tells the Integrations page how
 * it went and closes.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import { GMAIL_CONNECT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/gmailConnect";
import type { BrowserContext, Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const GOOGLE_ANSWER = { code: "c0de", state: "signed.state" };
const CONNECTED: Integration = { provider: "gmail", connected: true, last_synced_at: null, gmail_label: null };

/** Seen by the popup too: it's another page in the same context, which page.route() doesn't reach. */
async function stubPopupApi(context: BrowserContext, complete: (body: unknown) => { status: number; body: unknown }) {
  const finished: unknown[] = [];
  await context.route("**/api/**", (route) => route.fulfill(json({ detail: "Not Found" }, 404)));
  await context.route("**/api/integrations/gmail/complete", (route) => {
    const body = route.request().postDataJSON();
    finished.push(body);
    const answer = complete(body);
    return route.fulfill(answer.status === 204 ? { status: 204 } : json(answer.body, answer.status));
  });
  return finished;
}

async function openIntegrations(page: Page, integrations: () => Integration[]) {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/integrations", (route) => route.fulfill(json(integrations())));
  await page.route("**/api/integrations/gmail/connect", (route) =>
    route.fulfill(json({ auth_url: `/oauth-callback#code=${GOOGLE_ANSWER.code}&state=${GOOGLE_ANSWER.state}` })),
  );
  await page.goto("/integrations");
}

/** Connects, and waits for the popup to finish and close itself. */
async function connectInPopup(page: Page): Promise<void> {
  const popupOpened = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Connect Gmail/ }).first().click();
  const popup = await popupOpened;
  if (!popup.isClosed()) await popup.waitForEvent("close");
}

test("the person who started it finishes it in the popup, and the page shows Gmail connected", async ({ page }) => {
  let connected = false;
  const finished = await stubPopupApi(page.context(), () => {
    connected = true;
    return { status: 204, body: null };
  });
  await openIntegrations(page, () => (connected ? [CONNECTED] : []));

  await connectInPopup(page);

  expect(finished).toEqual([GOOGLE_ANSWER]);
  await expect(page.getByText("Gmail's connected.")).toBeVisible();
  await expect(page.getByText(/Connected · Last synced/)).toBeVisible();
});

test("a connection someone else started is refused, and the page says why", async ({ page }) => {
  const finished = await stubPopupApi(page.context(), () => ({ status: 403, body: { detail: "wrong_account" } }));
  await openIntegrations(page, () => []);

  await connectInPopup(page);

  expect(finished).toEqual([GOOGLE_ANSWER]);
  await expect(page.getByText(GMAIL_CONNECT_FAILURE_MESSAGES.wrong_account)).toBeVisible();
  await expect(page.getByText(/Connected · Last synced/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Connect Gmail/ }).first()).toBeVisible();
});
