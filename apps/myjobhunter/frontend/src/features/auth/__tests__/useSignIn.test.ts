import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { isUnverifiedError, useSignIn } from "@/features/auth/useSignIn";

// Mock the auth lib and toast
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  register: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showError: vi.fn(),
    showSuccess: vi.fn(),
  };
});

import { signIn, register } from "@/lib/auth";
import { showError } from "@platform/ui";

const mockSignIn = vi.mocked(signIn);
const mockRegister = vi.mocked(register);
const mockShowError = vi.mocked(showError);

describe("useSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleSignIn", () => {
    it("calls signIn with the provided credentials", async () => {
      mockSignIn.mockResolvedValue(undefined);
      const { result } = renderHook(() => useSignIn());
      await result.current.handleSignIn("user@example.com", "mypassword123");
      expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "mypassword123");
    });

    it("re-throws and shows a toast on sign-in failure", async () => {
      mockSignIn.mockRejectedValue(new Error("Invalid credentials"));
      const { result } = renderHook(() => useSignIn());
      await expect(
        result.current.handleSignIn("user@example.com", "wrong")
      ).rejects.toThrow("Invalid credentials");
      expect(mockShowError).toHaveBeenCalledWith("Invalid credentials");
    });

    it("shows a fallback toast message when error has no message", async () => {
      mockSignIn.mockRejectedValue("unexpected error");
      const { result } = renderHook(() => useSignIn());
      await expect(
        result.current.handleSignIn("u@e.com", "p")
      ).rejects.toBeDefined();
      expect(mockShowError).toHaveBeenCalledWith(
        "Couldn't sign you in — please try again."
      );
    });

    it("does NOT show a toast when the error is LOGIN_USER_NOT_VERIFIED (Login page handles it)", async () => {
      const err = { data: { detail: "LOGIN_USER_NOT_VERIFIED" } };
      mockSignIn.mockRejectedValue(err);
      const { result } = renderHook(() => useSignIn());
      await expect(
        result.current.handleSignIn("u@e.com", "p")
      ).rejects.toBe(err);
      expect(mockShowError).not.toHaveBeenCalled();
    });
  });

  describe("isUnverifiedError", () => {
    it("returns true for the fastapi-users response shape", () => {
      expect(isUnverifiedError({ data: { detail: "LOGIN_USER_NOT_VERIFIED" } })).toBe(true);
    });

    it("returns true for axios-style errors with .response.data.detail", () => {
      expect(
        isUnverifiedError({
          response: { data: { detail: "LOGIN_USER_NOT_VERIFIED" } },
        }),
      ).toBe(true);
    });

    it("returns false for other error shapes", () => {
      expect(isUnverifiedError(null)).toBe(false);
      expect(isUnverifiedError("string error")).toBe(false);
      expect(isUnverifiedError({ data: { detail: "LOGIN_BAD_CREDENTIALS" } })).toBe(false);
      expect(isUnverifiedError(new Error("plain error"))).toBe(false);
    });
  });

  describe("handleRegister", () => {
    it("calls register with the provided credentials and an empty captcha token by default", async () => {
      mockRegister.mockResolvedValue(undefined);
      const { result } = renderHook(() => useSignIn());
      await result.current.handleRegister("new@example.com", "securepass123");
      expect(mockRegister).toHaveBeenCalledWith(
        "new@example.com",
        "securepass123",
        "",
      );
    });

    it("forwards the Turnstile token to the register helper when provided", async () => {
      mockRegister.mockResolvedValue(undefined);
      const { result } = renderHook(() => useSignIn());
      await result.current.handleRegister(
        "captcha@example.com",
        "securepass123",
        "turnstile-token-xyz",
      );
      expect(mockRegister).toHaveBeenCalledWith(
        "captcha@example.com",
        "securepass123",
        "turnstile-token-xyz",
      );
    });

    it("re-throws and shows a toast on registration failure", async () => {
      mockRegister.mockRejectedValue(new Error("Email already exists"));
      const { result } = renderHook(() => useSignIn());
      await expect(
        result.current.handleRegister("existing@example.com", "pass123"),
      ).rejects.toThrow("Email already exists");
      expect(mockShowError).toHaveBeenCalledWith("Email already exists");
    });
  });
});
