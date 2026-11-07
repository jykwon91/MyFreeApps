import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { cleanUpAfter } from "./cleanup";
import { E2E_ONBOARDING } from "./onboarding";
import { TestAccount } from "./test-account";

type Playwright = PlaywrightWorkerArgs["playwright"];

/**
 * A fresh account that owns an organization of its own. Nothing else writes to
 * it, so a spec can seed known data and assert exact totals. ``delete`` removes
 * the organization (and, by cascade, everything in it), then the account.
 */
export class SoloOrg {
  private constructor(
    private readonly account: TestAccount,
    readonly orgId: string,
    /** Signed in as the owner, scoped to the organization. */
    readonly api: APIRequestContext,
  ) {}

  static async create(playwright: Playwright, label: string): Promise<SoloOrg> {
    const account = await TestAccount.create(playwright, label);
    const unscoped = await account.apiContext(playwright);
    let solo: SoloOrg | undefined;
    try {
      const res = await unscoped.post("/organizations", { data: { name: `E2E ${label}` } });
      expect(res.status(), await res.text()).toBe(201);
      const { id } = (await res.json()) as { id: string };
      solo = new SoloOrg(account, id, await account.apiContext(playwright, id));
      const onboarded = await solo.api.post("/tax-profile/complete-onboarding", { data: E2E_ONBOARDING });
      expect(onboarded.ok(), await onboarded.text()).toBe(true);
      return solo;
    } catch (err) {
      const made = solo;
      return await cleanUpAfter(err, () => (made ? made.delete(playwright) : account.delete(playwright)));
    } finally {
      await unscoped.dispose();
    }
  }

  signIn(page: Page): Promise<void> {
    return this.account.signIn(page, this.orgId);
  }

  async delete(playwright: Playwright): Promise<void> {
    try {
      const res = await this.api.delete(`/organizations/${this.orgId}`);
      expect(res.status(), `the organization should be deleted: ${await res.text()}`).toBe(204);
    } finally {
      await this.api.dispose();
    }
    // Only now: the account can't be deleted while its organization exists.
    await this.account.delete(playwright);
  }
}
