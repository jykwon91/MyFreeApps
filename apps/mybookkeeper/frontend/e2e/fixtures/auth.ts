import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BACKEND_URL } from "./config";
import { storeSession } from "./session";
import { InviteTracker } from "./invite-tracker";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", ".auth-token");
const ORG_PATH = path.join(__dirname, "..", ".auth-org");

export function getToken(): string {
  return fs.readFileSync(TOKEN_PATH, "utf-8").trim();
}

export function getOrgId(): string {
  if (fs.existsSync(ORG_PATH)) {
    return fs.readFileSync(ORG_PATH, "utf-8").trim();
  }
  return "";
}

async function setupAuth(page: Page): Promise<void> {
  await storeSession(page, getToken(), getOrgId() || undefined);
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

export const test = base.extend<{ authedPage: Page; api: APIRequestContext; invites: InviteTracker }>({
  authedPage: async ({ page }, use) => {
    await setupAuth(page);
    await use(page);
  },
  api: async ({ playwright }, use) => {
    const token = getToken();
    const orgId = getOrgId();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (orgId) {
      headers["X-Organization-Id"] = orgId;
    }
    const ctx = await playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: headers,
    });
    await use(ctx);
    await ctx.dispose();
  },
  invites: async ({ api }, use) => {
    const orgId = getOrgId();
    expect(orgId, "the shared E2E user should have an organization").not.toBe("");
    const invites = new InviteTracker(api, orgId);
    await use(invites);
    await invites.cancelPending();
  },
});

export { expect };
export type { APIRequestContext };
