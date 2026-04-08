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

vi.mock("@/shared/lib/auth-store", () => ({
  notifyAuthChange: vi.fn(),
  useIsAuthenticated: vi.fn(),
}));

const { mockDispatch, mockResetApiState, mockClearOrganizationState } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockResetApiState: vi.fn(() => ({ type: "api/resetApiState" })),
  mockClearOrganizationState: vi.fn(() => ({ type: "organization/clearOrganizationState" })),
}));

vi.mock("@/shared/store", () => ({
  store: { dispatch: mockDispatch },
}));

vi.mock("@/shared/store/baseApi", () => ({
  baseApi: { util: { resetApiState: mockResetApiState } },
}));

vi.mock("@/shared/store/organizationSlice", () => ({
  clearOrganizationState: mockClearOrganizationState,
}));

import posthog from "posthog-js";
import api from "@/shared/lib/api";
import { login, logout } from "@/shared/lib/auth";

function createJwt(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, exp: Math.floor((Date.now() + 300_000) / 1000) }));
  return `${header}.${payload}.signature`;
}

describe("auth — session lifecycle", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
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
    it("dispatches resetApiState and clearOrganizationState on successful login", async () => {
      const token = createJwt("user-abc-123");
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { access_token: token },
      });

      await login("alice@example.com", "password");

      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockClearOrganizationState).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "api/resetApiState" });
      expect(mockDispatch).toHaveBeenCalledWith({ type: "organization/clearOrganizationState" });
    });

    it("does not reset session state when login fails (no access_token)", async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { detail: "totp_required" },
      });

      await login("alice@example.com", "password");

      expect(mockResetApiState).not.toHaveBeenCalled();
      expect(mockClearOrganizationState).not.toHaveBeenCalled();
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

    it("dispatches resetApiState and clearOrganizationState on logout", () => {
      logout();

      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockClearOrganizationState).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "api/resetApiState" });
      expect(mockDispatch).toHaveBeenCalledWith({ type: "organization/clearOrganizationState" });
    });

    it("redirects to /login", () => {
      logout();
      expect(window.location.href).toBe("/login");
    });
  });
});
