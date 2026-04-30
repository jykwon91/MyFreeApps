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
    it("stores the token in localStorage and notifies auth change", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "test.jwt.token", token_type: "bearer" },
      });

      await signIn("user@example.com", "password123");

      expect(localStorage.getItem("token")).toBe("test.jwt.token");
      expect(mockNotifyAuthChange).toHaveBeenCalledTimes(1);
    });

    it("calls the fastapi-users login endpoint with form-encoded body", async () => {
      mockApiPost.mockResolvedValueOnce({
        data: { access_token: "tok", token_type: "bearer" },
      });

      await signIn("u@e.com", "pass");

      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/jwt/login",
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })
      );

      // Verify the URLSearchParams contains username + password
      const [, params] = mockApiPost.mock.calls[0];
      const sp = params as URLSearchParams;
      expect(sp.get("username")).toBe("u@e.com");
      expect(sp.get("password")).toBe("pass");
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
      expect(mockApiPost).toHaveBeenCalledWith("/auth/register", {
        email: "u@e.com",
        password: "securepass123",
      });
      // Token must NOT be set — user has to verify their email first
      expect(localStorage.getItem("token")).toBeNull();
      expect(mockNotifyAuthChange).not.toHaveBeenCalled();
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
  });
});
