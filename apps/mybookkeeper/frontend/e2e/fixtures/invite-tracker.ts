import { expect, type APIRequestContext } from "@playwright/test";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { cleanUp } from "./cleanup";

/**
 * Invites one test makes in the shared E2E organization, cancelled in the
 * fixture's teardown. Teardown still runs when the test times out; a
 * ``finally`` in the test body does not.
 */
export class InviteTracker {
  private readonly emails = new Set<string>();

  constructor(
    private readonly api: APIRequestContext,
    readonly orgId: string,
  ) {}

  /** Invites ``email`` through the API and tracks it for cleanup. */
  async create(email: string, orgRole: OrgRole): Promise<OrgInvite> {
    this.track(email);
    const res = await this.api.post(`/organizations/${this.orgId}/invites`, { data: { email, org_role: orgRole } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as OrgInvite;
  }

  /** Tracks an invite the test makes another way, such as through the invite form. */
  track(email: string): void {
    this.emails.add(email);
  }

  /** The pending invite to ``email``, if there is one. */
  async findPending(email: string): Promise<OrgInvite | undefined> {
    const res = await this.api.get(`/organizations/${this.orgId}/invites`);
    expect(res.ok(), await res.text()).toBe(true);
    const invites = (await res.json()) as OrgInvite[];
    return invites.find((i) => i.email === email && i.status === "pending");
  }

  /** Cancels every tracked invite that is still pending. */
  async cancelPending(): Promise<void> {
    await cleanUp(
      ...[...this.emails].map((email) => async () => {
        const invite = await this.findPending(email);
        if (!invite) return;
        const res = await this.api.delete(`/organizations/${this.orgId}/invites/${invite.id}`);
        expect(res.status(), `cleanup: cancel the invite to ${email}: ${await res.text()}`).toBe(204);
      }),
    );
  }
}
