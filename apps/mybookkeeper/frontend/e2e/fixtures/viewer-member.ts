import { expect, type APIRequestContext, type APIResponse, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { getOrgId, getToken } from "./auth";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { BACKEND_URL } from "./config";

const PASSWORD = "E2eViewerMemb3r!Secure";

/**
 * A second account that joined the shared E2E user's organization as a viewer,
 * through a real invite and the real accept endpoint.
 *
 * Make one per spec file, in ``beforeAll``. ``delete`` removes the account (and
 * so its membership) and the accepted invite, which would otherwise stay behind.
 */
export class ViewerMember {
  private constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    readonly orgId: string,
    private readonly token: string,
    private readonly inviteId: string,
    /** Signed in as the viewer, scoped to the organization it joined. */
    readonly api: APIRequestContext,
  ) {}

  static async join(playwright: PlaywrightWorkerArgs["playwright"], label: string): Promise<ViewerMember> {
    const email = `e2e-viewer-${label}-${Date.now()}@example.com`;
    const name = `E2E Viewer ${label}`;
    const orgId = getOrgId();
    expect(orgId, "the shared E2E user should have an organization").not.toBe("");
    const owner = await ownerContext(playwright, orgId);
    const anon = await playwright.request.newContext({ baseURL: BACKEND_URL });
    let token = "";
    let inviteId = "";
    try {
      // Not /auth/register: sign-ups and sign-ins are limited per IP, and a
      // full run already comes close. Joining below still goes through the
      // real invite and accept endpoints.
      const created = await anon.post("/test/users", { data: { email, password: PASSWORD, name } });
      expect(created.status(), await created.text()).toBe(201);
      const { id: userId, access_token } = (await created.json()) as { id: string; access_token: string };
      token = access_token;
      const auth = { Authorization: `Bearer ${token}` };

      const invited = await owner.post(`/organizations/${orgId}/invites`, { data: { email, org_role: "viewer" } });
      expect(invited.status(), await invited.text()).toBe(201);
      ({ id: inviteId } = (await invited.json()) as { id: string });
      const tokenRes = await owner.get(`/test/invites/${inviteId}/token`);
      expect(tokenRes.ok(), await tokenRes.text()).toBe(true);
      const { token: inviteToken } = (await tokenRes.json()) as { token: string };
      const accepted = await anon.post(`/organizations/invites/${inviteToken}/accept`, { headers: auth });
      expect(accepted.ok(), await accepted.text()).toBe(true);

      const api = await playwright.request.newContext({
        baseURL: BACKEND_URL,
        extraHTTPHeaders: { ...auth, "X-Organization-Id": orgId },
      });
      return new ViewerMember(userId, email, name, orgId, token, inviteId, api);
    } catch (err) {
      // Half set up: nothing will hold the member to delete it later.
      if (token) await deleteAccount(anon, email, { Authorization: `Bearer ${token}` });
      if (inviteId) await owner.delete(`/test/invites/${inviteId}`);
      throw err;
    } finally {
      await anon.dispose();
      await owner.dispose();
    }
  }

  /** Signs ``page`` in as this account, in the organization it joined. */
  async signIn(page: Page): Promise<void> {
    await page.goto("/login");
    await page.evaluate(
      ([t, o]) => {
        localStorage.setItem("token", t);
        localStorage.setItem("v1_activeOrgId", o);
      },
      [this.token, this.orgId],
    );
  }

  /** This member's role, as the organization's member list has it. */
  async roleIn(api: APIRequestContext): Promise<string | undefined> {
    const res = await api.get(`/organizations/${this.orgId}/members`);
    expect(res.ok(), await res.text()).toBe(true);
    const members = (await res.json()) as OrgMember[];
    return members.find((m) => m.user_id === this.userId)?.org_role;
  }

  /** Deletes this account (and so its membership) and its invite, then ends the session. */
  async delete(playwright: PlaywrightWorkerArgs["playwright"]): Promise<void> {
    const owner = await ownerContext(playwright, this.orgId);
    try {
      const deleted = await deleteAccount(this.api, this.email);
      expect(deleted.ok(), `the viewer account should be cleaned up: ${await deleted.text()}`).toBe(true);
      const invite = await owner.delete(`/test/invites/${this.inviteId}`);
      expect(invite.status(), `the viewer's invite should be cleaned up: ${await invite.text()}`).toBe(204);
    } finally {
      await owner.dispose();
      await this.api.dispose();
    }
  }
}

function ownerContext(playwright: PlaywrightWorkerArgs["playwright"], orgId: string): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${getToken()}`, "X-Organization-Id": orgId },
  });
}

function deleteAccount(ctx: APIRequestContext, email: string, headers: Record<string, string> = {}): Promise<APIResponse> {
  return ctx.delete("/users/me", { headers, data: { password: PASSWORD, confirm_email: email } });
}
