import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTransparency } from "../components/widgets/useTransparency";

const DATA = {
  month: "June 2026",
  costs_cents: 8200,
  donations_cents: 4700,
  updated_at: null,
  configured: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useTransparency", () => {
  it("returns ok with data on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) })),
    );
    const { result } = renderHook(() => useTransparency());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current).toEqual({ status: "ok", data: DATA });
  });

  it("omits credentials so no session token leaks to the public endpoint", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useTransparency());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transparency",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("returns error on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const { result } = renderHook(() => useTransparency());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("returns error when the request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
    const { result } = renderHook(() => useTransparency());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
