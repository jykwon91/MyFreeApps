import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { __loaded: false, identify: vi.fn(), reset: vi.fn(), get_property: vi.fn(), get_distinct_id: vi.fn() },
}));
vi.mock("@/shared/lib/api", () => ({ default: { post: vi.fn() } }));

const ORG_KEY = "v1_activeOrgId";
const OWNER_KEY = "v1_activeOrgOwner";

function jwtFor(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, exp: Math.floor((Date.now() + 300_000) / 1000) }));
  return `${header}.${payload}.signature`;
}

async function loadAuth(): Promise<string | null> {
  vi.resetModules();
  await import("@/shared/lib/auth");
  const { store } = await import("@/shared/store");
  return store.getState().organization.activeOrgId;
}

describe("auth — stored organization at module load", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("forgets a choice another user made when a different user is signed in", async () => {
    localStorage.setItem("token", jwtFor("user-b"));
    localStorage.setItem(ORG_KEY, "org-a");
    localStorage.setItem(OWNER_KEY, "user-a");

    const activeOrgId = await loadAuth();

    expect(localStorage.getItem(ORG_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(activeOrgId).toBeNull();
  });

  it("keeps the signed-in user's own choice", async () => {
    localStorage.setItem("token", jwtFor("user-a"));
    localStorage.setItem(ORG_KEY, "org-a");
    localStorage.setItem(OWNER_KEY, "user-a");

    const activeOrgId = await loadAuth();

    expect(localStorage.getItem(ORG_KEY)).toBe("org-a");
    expect(activeOrgId).toBe("org-a");
  });

  it("adopts a legacy choice for the signed-in user", async () => {
    localStorage.setItem("token", jwtFor("user-a"));
    localStorage.setItem(ORG_KEY, "org-legacy");

    await loadAuth();

    expect(localStorage.getItem(ORG_KEY)).toBe("org-legacy");
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-a");
  });

  it("leaves a stored choice alone when no one is signed in", async () => {
    localStorage.setItem(ORG_KEY, "org-a");
    localStorage.setItem(OWNER_KEY, "user-a");

    await loadAuth();

    expect(localStorage.getItem(ORG_KEY)).toBe("org-a");
  });
});
