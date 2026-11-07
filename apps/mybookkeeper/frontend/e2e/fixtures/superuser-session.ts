import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import {
  currentTotpStep,
  msUntilNextTotpStep,
  totpCodeAtStep,
} from "../../../../../packages/shared-frontend/src/testing/totpCode";
import { BACKEND_URL } from "./config";
import { E2E_ONBOARDING } from "./onboarding";

const PASSWORD = "E2eSuperAdm1n!Secure";

/**
 * A fresh super admin with two-step sign-in on, for the endpoints behind the
 * strict superuser gate (super admin + sign-in within the hour + a fresh code).
 *
 * Its own account: the shared E2E user isn't a super admin, and making it one
 * would hand every other spec the operator's powers. Registration is limited
 * per IP, so make one per spec file, in ``beforeAll``.
 *
 * The server spends each code once and only takes a later step than the last,
 * within one step of now. ``nextTotpCode`` waits for the next step when it has
 * to. Calls made from the test itself spend recovery codes instead, which have
 * no clock, so the waits stay with the UI steps being tested.
 */
export class SuperuserSession {
  private lastStep: number;

  private constructor(
    readonly email: string,
    readonly api: APIRequestContext,
    private readonly token: string,
    private readonly orgId: string,
    private readonly secret: string,
    private readonly recoveryCodes: string[],
    enabledAtStep: number,
  ) {
    this.lastStep = enabledAtStep;
  }

  /** ``stepUps`` is how many calls the spec makes past the gate from the test itself. */
  static async create(
    playwright: PlaywrightWorkerArgs["playwright"],
    label: string,
    stepUps: number,
  ): Promise<SuperuserSession> {
    const email = `e2e-superuser-${label}-${Date.now()}@example.com`;
    const anon = await playwright.request.newContext({ baseURL: BACKEND_URL });
    let token = "";
    let recoveryCode: string | null = null;
    try {
      const registered = await anon.post("/auth/register", { data: { email, password: PASSWORD, name: "E2E Super Admin" } });
      expect(registered.ok(), await registered.text()).toBe(true);
      expect((await anon.post("/test/verify-email", { data: { email } })).ok()).toBe(true);
      const signedIn = await anon.post("/auth/totp/login", { data: { email, password: PASSWORD } });
      expect(signedIn.ok(), await signedIn.text()).toBe(true);
      ({ access_token: token } = (await signedIn.json()) as { access_token: string });

      const auth = { Authorization: `Bearer ${token}` };
      expect((await anon.post("/test/promote-admin", { headers: auth })).ok()).toBe(true);
      expect((await anon.post("/test/promote-superuser", { headers: auth })).ok()).toBe(true);

      const org = await anon.post("/organizations", { headers: auth, data: { name: "E2E Super Admin" } });
      expect(org.ok(), await org.text()).toBe(true);
      const { id: orgId } = (await org.json()) as { id: string };
      const onboarded = await anon.post("/tax-profile/complete-onboarding", {
        headers: { ...auth, "X-Organization-Id": orgId },
        data: E2E_ONBOARDING,
      });
      expect(onboarded.ok(), await onboarded.text()).toBe(true);

      const setup = await anon.post("/auth/totp/setup", { headers: auth, data: { password: PASSWORD } });
      expect(setup.ok(), await setup.text()).toBe(true);
      const { secret } = (await setup.json()) as { secret: string };
      const step = currentTotpStep();
      const enabled = await anon.post("/auth/totp/verify", { headers: auth, data: { code: totpCodeAtStep(secret, step) } });
      expect(enabled.ok(), await enabled.text()).toBe(true);
      const { recovery_codes: recoveryCodes } = (await enabled.json()) as { recovery_codes: string[] };
      recoveryCode = recoveryCodes[0];
      // One more than asked for: deleting the account spends one too.
      expect(recoveryCodes.length).toBeGreaterThan(stepUps);

      const api = await playwright.request.newContext({
        baseURL: BACKEND_URL,
        extraHTTPHeaders: { ...auth, "X-Organization-Id": orgId },
      });
      return new SuperuserSession(email, api, token, orgId, secret, recoveryCodes, step);
    } catch (err) {
      // Half set up: nothing will hold the session to delete it later.
      if (token) {
        await anon.delete("/users/me", {
          headers: { Authorization: `Bearer ${token}` },
          data: { password: PASSWORD, confirm_email: email, totp_code: recoveryCode },
        });
      }
      throw err;
    } finally {
      await anon.dispose();
    }
  }

  /** Signs ``page`` in as this account. */
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

  /**
   * A code the server hasn't seen yet, for the step-up dialog. Assumes the test
   * runner and the backend share a clock, as they do on one machine or CI runner.
   */
  async nextTotpCode(): Promise<string> {
    const step = Math.max(this.lastStep + 1, currentTotpStep());
    while (step > currentTotpStep() + 1) {
      await new Promise((resolve) => setTimeout(resolve, msUntilNextTotpStep() + 50));
    }
    this.lastStep = step;
    return totpCodeAtStep(this.secret, step);
  }

  /** Headers that get one call from the test past the strict superuser gate. */
  stepUpHeaders(): Record<string, string> {
    const code = this.recoveryCodes.shift();
    if (!code) throw new Error("SuperuserSession is out of recovery codes");
    return { "X-TOTP-Code": code };
  }

  /** Deletes this account, then ends the session. */
  async delete(): Promise<void> {
    const deleted = await this.api.delete("/users/me", {
      data: { password: PASSWORD, confirm_email: this.email, totp_code: this.stepUpHeaders()["X-TOTP-Code"] },
    });
    try {
      expect(deleted.ok(), `the super admin account should be cleaned up: ${await deleted.text()}`).toBe(true);
    } finally {
      await this.api.dispose();
    }
  }
}
