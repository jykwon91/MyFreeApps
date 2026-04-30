import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

// Mock axios and @platform/ui auth-store before importing auth.ts
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    notifyAuthChange: vi.fn(),
  };
});

// Mock the api module to control HTTP calls
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from "@/lib/api";
import { notifyAuthChange } from "@platform/ui";
import { signIn, register, signOut } from "@/lib/auth";

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
    it("calls register endpoint then auto sign-in", async () => {
      // First call: register, second call: signIn login
      mockApiPost
        .mockResolvedValueOnce({ data: { id: "uuid", email: "u@e.com" } })
        .mockResolvedValueOnce({
          data: { access_token: "new.token", token_type: "bearer" },
        });

      await register("u@e.com", "securepass123");

      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        { email: "u@e.com", password: "securepass123" },
        // No turnstile token → empty headers object.
        { headers: {} },
      );
      expect(localStorage.getItem("token")).toBe("new.token");
    });

    it("forwards a Turnstile token as the X-Turnstile-Token header", async () => {
      mockApiPost
        .mockResolvedValueOnce({ data: { id: "uuid", email: "u@e.com" } })
        .mockResolvedValueOnce({
          data: { access_token: "new.token", token_type: "bearer" },
        });

      await register("u@e.com", "securepass123", "captcha-token-123");

      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        { email: "u@e.com", password: "securepass123" },
        { headers: { "X-Turnstile-Token": "captcha-token-123" } },
      );
    });

    it("omits the captcha header when the token is an empty string", async () => {
      mockApiPost
        .mockResolvedValueOnce({ data: { id: "uuid", email: "u@e.com" } })
        .mockResolvedValueOnce({
          data: { access_token: "new.token", token_type: "bearer" },
        });

      await register("u@e.com", "securepass123", "");

      const [, , config] = mockApiPost.mock.calls[0];
      expect(config).toEqual({ headers: {} });
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
  });
});
