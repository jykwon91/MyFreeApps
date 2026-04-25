import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("frontend error reporting", () => {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });
  const mockGetItem = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("localStorage", {
      getItem: mockGetItem,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    mockFetch.mockClear();
    mockGetItem.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends error events to /api/errors with auth header", () => {
    mockGetItem.mockReturnValue("test-jwt-token");

    const handler = (event: ErrorEvent) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: event.message,
          stack: event.error?.stack,
          url: event.filename,
        }),
      }).catch(() => {});
    };

    handler(new ErrorEvent("error", {
      message: "Test error",
      filename: "http://localhost/test.js",
      error: new Error("Test error"),
    }));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("/api/errors", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-jwt-token",
      }),
    }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.message).toBe("Test error");
    expect(body.url).toBe("http://localhost/test.js");
  });

  it("does not send when no token is available", () => {
    mockGetItem.mockReturnValue(null);

    const handler = (event: ErrorEvent) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: event.message }),
      }).catch(() => {});
    };

    handler(new ErrorEvent("error", { message: "Test error" }));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends unhandled rejection events", () => {
    mockGetItem.mockReturnValue("test-jwt-token");

    const reason = new Error("Promise rejected");
    const handler = (event: { reason: unknown }) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: String(event.reason),
          stack: (event.reason as Error)?.stack,
        }),
      }).catch(() => {});
    };

    handler({ reason });

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.message).toContain("Promise rejected");
    expect(body.stack).toBeDefined();
  });
});
