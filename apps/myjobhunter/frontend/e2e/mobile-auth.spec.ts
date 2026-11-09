import { test, expect, type APIRequestContext } from "@playwright/test";
import { createTestUser, deleteTestUser, resetRateLimit, type TestUser } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";
const MOBILE_AUTH = `${BACKEND_URL}/api/auth/mobile`;

interface MobileTokens {
  access_token: string;
  refresh_token: string;
  session_id: string;
}

async function signIn(request: APIRequestContext, user: TestUser): Promise<MobileTokens> {
  await resetRateLimit(request);
  const response = await request.post(`${MOBILE_AUTH}/login`, {
    data: { email: user.email, password: user.password, device_name: "E2E phone" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as MobileTokens;
}

function bearer(tokens: MobileTokens): Record<string, string> {
  return { Authorization: `Bearer ${tokens.access_token}` };
}

/**
 * The phone app's sign-in, against the real stack (proxy, backend, database).
 * The web app never calls these routes, so this drives them the way the phone does.
 */
test.describe("MyJobHunter phone sign-in", () => {
  test("sign in, refresh, see the device, sign out", async ({ request }) => {
    const user = await createTestUser(request);
    try {
      const tokens = await signIn(request, user);
      expect((await request.get(`${BACKEND_URL}/api/users/me`, { headers: bearer(tokens) })).status()).toBe(200);

      const refreshResponse = await request.post(`${MOBILE_AUTH}/refresh`, {
        data: { refresh_token: tokens.refresh_token },
      });
      expect(refreshResponse.status()).toBe(200);
      const refreshed = (await refreshResponse.json()) as MobileTokens;
      expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

      const sessions = await request.get(`${MOBILE_AUTH}/sessions`, { headers: bearer(refreshed) });
      expect(sessions.status()).toBe(200);
      const devices = (await sessions.json()) as { id: string; device_name: string | null }[];
      expect(devices.map((device) => device.id)).toContain(tokens.session_id);

      const logout = await request.post(`${MOBILE_AUTH}/logout`, {
        data: { refresh_token: refreshed.refresh_token },
      });
      expect(logout.status()).toBe(204);

      const afterLogout = await request.post(`${MOBILE_AUTH}/refresh`, {
        data: { refresh_token: refreshed.refresh_token },
      });
      expect(afterLogout.status()).toBe(401);
      expect((await afterLogout.json()).detail).toBe("refresh_invalid");
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("a wrong password gets no tokens", async ({ request }) => {
    const user = await createTestUser(request);
    try {
      await resetRateLimit(request);
      const response = await request.post(`${MOBILE_AUTH}/login`, {
        data: { email: user.email, password: `${user.password}-wrong` },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).not.toHaveProperty("refresh_token");
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
