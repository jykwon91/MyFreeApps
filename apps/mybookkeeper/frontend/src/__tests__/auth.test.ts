import type { AxiosAdapter } from "axios";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing the module under test
vi.mock("posthog-js", () => ({
  default: {
    __loaded: true,
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

const { mockDispatch, mockResetApiState } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockResetApiState: vi.fn(() => ({ type: "api/resetApiState" })),
}));

// A real organization slice, so the tests see what the session reset does to it,
// with every dispatch recorded.
vi.mock("@/shared/store", async () => {
  const { configureStore } = await import("@reduxjs/toolkit");
  const { default: organization } = await import("@/shared/store/organizationSlice");
  const realStore = configureStore({ reducer: { organization } });
  return {
    store: {
      getState: realStore.getState,
      dispatch: (action: Parameters<typeof realStore.dispatch>[0]) => {
        mockDispatch(action);
        return realStore.dispatch(action);
      },
    },
  };
});

vi.mock("@/shared/store/baseApi", () => ({
  baseApi: { util: { resetApiState: mockResetApiState } },
}));

import posthog from "posthog-js";
import sharedApi from "@platform/ui/lib/api";
import api from "@/shared/lib/api";
import { login, logout, notifyAuthChange } from "@/shared/lib/auth";
import { store } from "@/shared/store";
import { forgetOrganizations, setActiveOrg } from "@/shared/store/organizationSlice";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";

const RESET_API = { type: "api/resetApiState" };
const FORGET_ORGS = forgetOrganizations();
const ORG_KEY = "v1_activeOrgId";

function createJwt(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, exp: Math.floor((Date.now() + 300_000) / 1000) }));
  return `${header}.${payload}.signature`;
}

function organizationState(): { activeOrgId: string | null; organizations: OrgWithRole[] } {
  return store.getState().organization;
}

const rejectWith401: AxiosAdapter = async (config) =>
  Promise.reject({
    response: { status: 401, statusText: "Err", headers: {}, data: {}, config },
    config,
    isAxiosError: true,
  });

async function signIn(sub: string): Promise<void> {
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: { access_token: createJwt(sub) },
  });
  await login("alice@example.com", "password");
}

describe("auth — session lifecycle", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    // Start each test signed out, as far as the auth store knows.
    notifyAuthChange();
    store.dispatch(forgetOrganizations());
    vi.clearAllMocks();
    (posthog as unknown as { __loaded: boolean }).__loaded = true;
    // Stub window.location.href assignment in logout()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  describe("login — PostHog identification", () => {
    it("calls posthog.identify with user id from JWT and email on successful login", async () => {
      const token = createJwt("user-abc-123");
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { access_token: token },
      });

      await login("alice@example.com", "password");

      expect(posthog.identify).toHaveBeenCalledWith("user-abc-123", {
        email: "alice@example.com",
      });
    });

    it("does not call posthog.identify when posthog is not initialized", async () => {
      (posthog as unknown as { __loaded: boolean }).__loaded = false;
      const token = createJwt("user-abc-123");
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { access_token: token },
      });

      await login("alice@example.com", "password");

      expect(posthog.identify).not.toHaveBeenCalled();
    });

    it("does not call posthog.identify when no access_token is returned (e.g. TOTP required)", async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { detail: "totp_required" },
      });

      await login("alice@example.com", "password");

      expect(posthog.identify).not.toHaveBeenCalled();
    });

    it("silently swallows JWT decode errors without breaking login", async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { access_token: "not-a-valid-jwt" },
      });

      await expect(login("alice@example.com", "password")).resolves.toBeDefined();
      expect(posthog.identify).not.toHaveBeenCalled();
      expect(localStorage.getItem("token")).toBe("not-a-valid-jwt");
    });

    it("stores the token in localStorage on success", async () => {
      const token = createJwt("user-abc-123");
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { access_token: token },
      });

      await login("alice@example.com", "password");

      expect(localStorage.getItem("token")).toBe(token);
    });
  });

  describe("login — session state reset", () => {
    it("dispatches resetApiState and forgetOrganizations on successful login", async () => {
      await signIn("user-abc-123");

      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(RESET_API);
      expect(mockDispatch).toHaveBeenCalledWith(FORGET_ORGS);
    });

    it("does not reset session state when login fails (no access_token)", async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { detail: "totp_required" },
      });

      await login("alice@example.com", "password");

      expect(mockResetApiState).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe("session state reset outside login and logout", () => {
    it("resets session state when a 401 signs out", async () => {
      await signIn("user-abc-123");
      vi.clearAllMocks();

      await expect(sharedApi.get("/properties", { adapter: rejectWith401 })).rejects.toBeDefined();

      expect(localStorage.getItem("token")).toBeNull();
      expect(mockDispatch).toHaveBeenCalledWith(RESET_API);
      expect(mockDispatch).toHaveBeenCalledWith(FORGET_ORGS);
    });

    it("resets session state when another tab signs in as someone else", async () => {
      await signIn("user-abc-123");
      vi.clearAllMocks();
      localStorage.setItem("token", createJwt("user-xyz-789"));
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));

      expect(mockDispatch).toHaveBeenCalledWith(RESET_API);
      expect(mockDispatch).toHaveBeenCalledWith(FORGET_ORGS);
    });

    it("keeps session state when another tab gets a new token for the same user", async () => {
      await signIn("user-abc-123");
      vi.clearAllMocks();
      localStorage.setItem("token", `${createJwt("user-abc-123")}-refreshed`);
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // localStorage is shared by every tab. This module is tab 1; tab 2 is simulated by
  // writing localStorage directly, then delivering the storage event tab 1 would get.
  describe("the stored organization choice", () => {
    it("survives another tab's sign-in, which picked it, and becomes this tab's choice", async () => {
      await signIn("user-abc-123");
      store.dispatch(setActiveOrg("org-a"));

      // Tab 2 signs in as another user and picks an organization.
      localStorage.setItem("token", createJwt("user-xyz-789"));
      localStorage.setItem(ORG_KEY, "org-b");
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));

      expect(localStorage.getItem(ORG_KEY)).toBe("org-b");
      expect(organizationState()).toEqual({ activeOrgId: "org-b", organizations: [] });
    });

    it("is kept when the same user signs back in after a 401", async () => {
      await signIn("user-abc-123");
      store.dispatch(setActiveOrg("org-a"));

      await expect(sharedApi.get("/properties", { adapter: rejectWith401 })).rejects.toBeDefined();
      expect(localStorage.getItem(ORG_KEY)).toBe("org-a");
      await signIn("user-abc-123");

      expect(localStorage.getItem(ORG_KEY)).toBe("org-a");
      expect(organizationState().activeOrgId).toBe("org-a");
    });

    it("is removed when someone else signs in after a 401", async () => {
      await signIn("user-abc-123");
      store.dispatch(setActiveOrg("org-a"));

      await expect(sharedApi.get("/properties", { adapter: rejectWith401 })).rejects.toBeDefined();
      await signIn("user-xyz-789");

      expect(localStorage.getItem(ORG_KEY)).toBeNull();
      expect(organizationState().activeOrgId).toBeNull();
    });
  });

  describe("logout", () => {
    it("calls posthog.reset and clears localStorage tokens", () => {
      localStorage.setItem("token", "some-token");
      localStorage.setItem("v1_activeOrgId", "org-123");

      logout();

      expect(posthog.reset).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("v1_activeOrgId")).toBeNull();
    });

    it("does not call posthog.reset when posthog is not initialized", () => {
      (posthog as unknown as { __loaded: boolean }).__loaded = false;
      localStorage.setItem("token", "some-token");

      logout();

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(localStorage.getItem("token")).toBeNull();
    });

    it("dispatches resetApiState and forgetOrganizations on logout, and forgets the chosen organization", async () => {
      await signIn("user-abc-123");
      store.dispatch(setActiveOrg("org-a"));
      vi.clearAllMocks();

      logout();

      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(RESET_API);
      expect(mockDispatch).toHaveBeenCalledWith(FORGET_ORGS);
      expect(localStorage.getItem(ORG_KEY)).toBeNull();
      expect(organizationState().activeOrgId).toBeNull();
    });

    it("redirects to /login", () => {
      logout();
      expect(window.location.href).toBe("/login");
    });
  });
});
