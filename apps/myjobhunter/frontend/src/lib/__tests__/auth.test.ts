import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

// vi.mock factories run BEFORE module-scope statements after the
// hoisting pass, so any helper they reference must come from
// vi.hoisted() to be initialized in time.
const { mockResetApiState, mockResetApiStateAction, mockDispatch } = vi.hoisted(() => {
  const action = { type: "api/util/resetApiState" };
  return {
    mockResetApiStateAction: action,
    mockResetApiState: vi.fn(() => action),
    mockDispatch: vi.fn(),
  };
});

// Mock axios and @platform/ui auth-store before importing auth.ts
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    notifyAuthChange: vi.fn(),
    baseApi: {
      ...actual.baseApi,
      util: {
        ...actual.baseApi.util,
        resetApiState: mockResetApiState,
      },
    },
  };
});

// Mock the local store so we can assert resetApiState is dispatched on
// auth transitions (PR #340 — wipes cached /users/me etc. so the next
// signed-in user doesn't see the previous user's identity until refresh).
vi.mock("@/lib/store", () => ({
  store: { dispatch: mockDispatch },
}));

// Mock the api module to control HTTP calls
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from "@/lib/api";
import { notifyAuthChange } from "@platform/ui";
import { signIn, register, requestVerifyToken, signOut } from "@/lib/auth";

const mockApiPost = vi.mocked(api.post);
const mockNotifyAuthChange = vi.mocked(notifyAuthChange);

describe("auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("signIn", () => {
    it("stores the token in localStorage and notifies auth change on success", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "test.jwt.token", token_type: "bearer" },
      });

      const result = await signIn("user@example.com", "password123");

      expect(result).toEqual({ status: "ok" });
      expect(localStorage.getItem("token")).toBe("test.jwt.token");
      expect(mockNotifyAuthChange).toHaveBeenCalledTimes(1);
    });

    it("posts to /auth/totp/login with email + password JSON body", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "tok", token_type: "bearer" },
      });

      await signIn("u@e.com", "pass");

      expect(mockApiPost).toHaveBeenCalledWith("/auth/totp/login", {
        email: "u@e.com",
        password: "pass",
        totp_code: undefined,
      });
    });

    it("forwards totp_code on the second call after totp_required", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "tok", token_type: "bearer" },
      });

      await signIn("u@e.com", "pass", "654321");

      expect(mockApiPost).toHaveBeenCalledWith("/auth/totp/login", {
        email: "u@e.com",
        password: "pass",
        totp_code: "654321",
      });
    });

    it("returns status: totp_required when backend signals 2FA gate", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { detail: "totp_required" },
      });

      const result = await signIn("u@e.com", "pass");

      expect(result).toEqual({ status: "totp_required" });
      expect(localStorage.getItem("token")).toBeNull();
      expect(mockNotifyAuthChange).not.toHaveBeenCalled();
    });

    it("throws on network error without writing to localStorage", async () => {
      mockApiPost.mockRejectedValueOnce(
        new axios.AxiosError("Network Error")
      );

      await expect(signIn("u@e.com", "pass")).rejects.toThrow();
      expect(localStorage.getItem("token")).toBeNull();
    });
  });

  describe("register", () => {
    it("calls register endpoint and does NOT auto sign-in (verification required)", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { id: "uuid", email: "u@e.com" },
      });

      await register("u@e.com", "securepass123");

      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        { email: "u@e.com", password: "securepass123" },
        { headers: {} },
      );
      // Token must NOT be set — user has to verify their email first
      expect(localStorage.getItem("token")).toBeNull();
      expect(mockNotifyAuthChange).not.toHaveBeenCalled();
    });

    it("forwards X-Turnstile-Token header when supplied", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { id: "uuid", email: "u@e.com" },
      });

      await register("u@e.com", "securepass123", "ts-token-abc");

      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        { email: "u@e.com", password: "securepass123" },
        { headers: { "X-Turnstile-Token": "ts-token-abc" } },
      );
    });
  });

  describe("requestVerifyToken", () => {
    it("posts the email to /auth/request-verify-token", async () => {
      mockApiPost.mockResolvedValueOnce({ data: null });
      await requestVerifyToken("u@e.com");
      expect(mockApiPost).toHaveBeenCalledWith("/auth/request-verify-token", {
        email: "u@e.com",
      });
    });
  });

  describe("signOut", () => {
    it("removes token from localStorage and notifies auth change", () => {
      localStorage.setItem("token", "some.token");

      signOut();

      expect(localStorage.getItem("token")).toBeNull();
      expect(mockNotifyAuthChange).toHaveBeenCalledTimes(1);
    });

    it("is safe to call when no token is stored", () => {
      expect(() => signOut()).not.toThrow();
      expect(mockNotifyAuthChange).toHaveBeenCalledTimes(1);
    });

    it("dispatches resetApiState so the next signed-in user does not see cached responses", () => {
      localStorage.setItem("token", "some.token");

      signOut();

      // Cache wipe MUST happen on signOut so a subsequent signIn from
      // a different user doesn't render previous-user data (the
      // 2026-05-06 "still showed mybookkeeper6 as signed-in" bug).
      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(mockResetApiStateAction);
    });
  });

  describe("RTK Query cache reset on auth transitions", () => {
    it("signIn dispatches resetApiState BEFORE notifyAuthChange", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "fresh.token", token_type: "bearer" },
      });

      await signIn("u@e.com", "pass");

      // Both must fire on a successful sign-in; order matters because
      // the auth-change notification triggers a re-render that should
      // refetch /users/me against the NEW token, not the previous
      // response.
      expect(mockResetApiState).toHaveBeenCalledTimes(1);
      expect(mockNotifyAuthChange).toHaveBeenCalledTimes(1);

      const resetOrder = mockResetApiState.mock.invocationCallOrder[0]!;
      const notifyOrder = mockNotifyAuthChange.mock.invocationCallOrder[0]!;
      expect(resetOrder).toBeLessThan(notifyOrder);
    });

    it("signIn does NOT reset the cache on a totp_required response", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { detail: "totp_required" },
      });

      await signIn("u@e.com", "pass");

      // 2FA gate hit; no token issued; nothing to wipe yet.
      expect(mockResetApiState).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
