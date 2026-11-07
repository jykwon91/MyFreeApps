import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { getOrgId, getToken } from "./auth";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { BACKEND_URL } from "./config";
import { TestAccount } from "./test-account";

type Playwright = PlaywrightWorkerArgs["playwright"];

/**
 * A second account that joined the shared E2E user's organization as a viewer,
 * through a real invite and the real accept endpoint.
 *
 * Make one per spec file, in ``beforeAll``. ``delete`` removes the account (and
 * so its membership) and the accepted invite, which would otherwise stay behind.
 */
export class ViewerMember {
  private constructor(
    private readonly account: TestAccount,
    readonly orgId: string,
    private readonly inviteId: string,
    /** Signed in as the viewer, scoped to the organization it joined. */
    readonly api: APIRequestContext,
  ) {}

  get userId(): string {
    return this.account.userId;
  }

  get name(): string {
    return this.account.name;
  }

  static async join(playwright: Playwright, label: string): Promise<ViewerMember> {
    const orgId = getOrgId();
    expect(orgId, "the shared E2E user should have an organization").not.toBe("");
    const account = await TestAccount.create(playwright, `viewer-${label}`);
    const owner = await ownerContext(playwright, orgId);
    const anon = await playwright.request.newContext({ baseURL: BACKEND_URL });
    let inviteId = "";
    try {
      const invited = await owner.post(`/organizations/${orgId}/invites`, {
        data: { email: account.email, org_role: "viewer" },
      });
      expect(invited.status(), await invited.text()).toBe(201);
      ({ id: inviteId } = (await invited.json()) as { id: string });
      const tokenRes = await owner.get(`/test/invites/${inviteId}/token`);
      expect(tokenRes.ok(), await tokenRes.text()).toBe(true);
      const { token: inviteToken } = (await tokenRes.json()) as { token: string };
      const accepted = await anon.post(`/organizations/invites/${inviteToken}/accept`, { headers: account.authHeader });
      expect(accepted.ok(), await accepted.text()).toBe(true);

      return new ViewerMember(account, orgId, inviteId, await account.apiContext(playwright, orgId));
    } catch (err) {
      // Half set up: nothing will hold the member to delete it later.
      await account.delete(playwright);
      if (inviteId) await owner.delete(`/test/invites/${inviteId}`);
      throw err;
    } finally {
      await anon.dispose();
      await owner.dispose();
    }
  }

  /** Signs ``page`` in as this account, in the organization it joined. */
  signIn(page: Page): Promise<void> {
    return this.account.signIn(page, this.orgId);
  }

  /** This member's role, as the organization's member list has it. */
  async roleIn(api: APIRequestContext): Promise<string | undefined> {
    const res = await api.get(`/organizations/${this.orgId}/members`);
    expect(res.ok(), await res.text()).toBe(true);
    const members = (await res.json()) as OrgMember[];
    return members.find((m) => m.user_id === this.userId)?.org_role;
  }

  /** Deletes this account (and so its membership) and its invite, then ends the session. */
  async delete(playwright: Playwright): Promise<void> {
    const owner = await ownerContext(playwright, this.orgId);
    try {
      await this.account.delete(playwright);
      const invite = await owner.delete(`/test/invites/${this.inviteId}`);
      expect(invite.status(), `the viewer's invite should be cleaned up: ${await invite.text()}`).toBe(204);
    } finally {
      await owner.dispose();
      await this.api.dispose();
    }
  }
}

function ownerContext(playwright: Playwright, orgId: string): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${getToken()}`, "X-Organization-Id": orgId },
  });
}
