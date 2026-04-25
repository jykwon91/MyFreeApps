import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AxiosError } from "axios";

vi.mock("@/shared/lib/auth-store", () => ({
  notifyAuthChange: vi.fn(),
}));

describe("api axios interceptor — 401 handling", () => {
  beforeEach(() => {
    localStorage.setItem("token", "dummy-token");
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem("token");
  });

  async function triggerInterceptor(err: Partial<AxiosError>): Promise<void> {
    const api = (await import("@/shared/lib/api")).default;
    // Reach into axios internals to run only the error handler — we want to
    // exercise the response-error branch without an actual network call.
    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ fulfilled?: unknown; rejected?: (e: unknown) => unknown } | null>;
    }).handlers;
    const rejected = handlers.find((h) => h && h.rejected)?.rejected;
    if (!rejected) throw new Error("No rejected interceptor found");
    try {
      await rejected(err);
    } catch {
      // The interceptor re-rejects by design — swallow so the test continues.
    }
  }

  it("logs the user out on 401 from a normal authenticated endpoint", async () => {
    const { notifyAuthChange } = await import("@/shared/lib/auth-store");

    await triggerInterceptor({
      response: { status: 401, data: {}, headers: {}, statusText: "", config: {} as never },
      config: { url: "/users/me" } as never,
    });

    expect(localStorage.getItem("token")).toBeNull();
    expect(notifyAuthChange).toHaveBeenCalledTimes(1);
  });

  it("does NOT log the user out on 401 from /integrations/gmail/sync (business-level 401)", async () => {
    const { notifyAuthChange } = await import("@/shared/lib/auth-store");

    await triggerInterceptor({
      response: {
        status: 401,
        data: { detail: "Gmail connection expired, please reconnect" },
        headers: {},
        statusText: "",
        config: {} as never,
      },
      config: { url: "/integrations/gmail/sync" } as never,
    });

    expect(localStorage.getItem("token")).toBe("dummy-token");
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("does not log out on 403 errors", async () => {
    const { notifyAuthChange } = await import("@/shared/lib/auth-store");

    await triggerInterceptor({
      response: {
        status: 403,
        data: { detail: "Forbidden" },
        headers: {},
        statusText: "",
        config: {} as never,
      },
      config: { url: "/admin/something" } as never,
    });

    expect(localStorage.getItem("token")).toBe("dummy-token");
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("does not log out on 401 from /auth/* endpoints (login flow)", async () => {
    const { notifyAuthChange } = await import("@/shared/lib/auth-store");

    await triggerInterceptor({
      response: { status: 401, data: {}, headers: {}, statusText: "", config: {} as never },
      config: { url: "/auth/jwt/login" } as never,
    });

    expect(localStorage.getItem("token")).toBe("dummy-token");
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });
});
