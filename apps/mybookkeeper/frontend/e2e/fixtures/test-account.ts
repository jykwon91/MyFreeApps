import { randomUUID } from "crypto";
import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { BACKEND_URL } from "./config";
import { storeSession } from "./session";

const PASSWORD = "E2eTestAcc0unt!Secure";

type Playwright = PlaywrightWorkerArgs["playwright"];

/**
 * A fresh, verified account, made through the test-only ``POST /test/users``
 * rather than /auth/register: sign-ups and sign-ins are limited per IP, and a
 * full run already comes close. It belongs to no organization until it makes
 * or joins one.
 */
export class TestAccount {
  private constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    private readonly token: string,
  ) {}

  static async create(playwright: Playwright, label: string): Promise<TestAccount> {
    // Unique even across workers that start in the same millisecond.
    const email = `e2e-${label}-${randomUUID()}@example.com`;
    const name = `E2E ${label}`;
    const anon = await playwright.request.newContext({ baseURL: BACKEND_URL });
    try {
      const created = await anon.post("/test/users", { data: { email, password: PASSWORD, name } });
      expect(created.status(), await created.text()).toBe(201);
      const { id, access_token } = (await created.json()) as { id: string; access_token: string };
      return new TestAccount(id, email, name, access_token);
    } finally {
      await anon.dispose();
    }
  }

  /** For specs that sign in or confirm through the UI, as the account's owner would. */
  get password(): string {
    return PASSWORD;
  }

  get authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  /** Signed in as this account; scoped to ``orgId`` when one is given. */
  apiContext(playwright: Playwright, orgId?: string): Promise<APIRequestContext> {
    return playwright.request.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: orgId ? { ...this.authHeader, "X-Organization-Id": orgId } : this.authHeader,
    });
  }

  /** Signs ``page`` in as this account, in ``orgId``. */
  signIn(page: Page, orgId: string): Promise<void> {
    return storeSession(page, this.token, orgId);
  }

  /** Deletes the account through ``DELETE /users/me``, as its owner would. */
  async delete(playwright: Playwright): Promise<void> {
    const ctx = await this.apiContext(playwright);
    try {
      const res = await ctx.delete("/users/me", { data: { password: PASSWORD, confirm_email: this.email } });
      expect(res.ok(), `the test account should be deleted: ${await res.text()}`).toBe(true);
    } finally {
      await ctx.dispose();
    }
  }
}
