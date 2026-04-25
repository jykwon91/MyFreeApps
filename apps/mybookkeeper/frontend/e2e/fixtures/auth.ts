import { test as base, type Page, type APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BACKEND_URL } from "./config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", ".auth-token");
const ORG_PATH = path.join(__dirname, "..", ".auth-org");

function getToken(): string {
  return fs.readFileSync(TOKEN_PATH, "utf-8").trim();
}

function getOrgId(): string {
  if (fs.existsSync(ORG_PATH)) {
    return fs.readFileSync(ORG_PATH, "utf-8").trim();
  }
  return "";
}

async function setupAuth(page: Page): Promise<void> {
  const token = getToken();
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("token", t), token);

  // Also set org ID if we have it
  const orgId = getOrgId();
  if (orgId) {
    await page.evaluate((id) => localStorage.setItem("v1_activeOrgId", id), orgId);
  }

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

export const test = base.extend<{ authedPage: Page; api: APIRequestContext }>({
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
});

export { expect } from "@playwright/test";
