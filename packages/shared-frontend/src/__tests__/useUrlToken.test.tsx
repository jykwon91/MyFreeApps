import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUrlToken } from "../hooks/useUrlToken";

function wrapperFor(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
}

describe("useUrlToken", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the token and removes it from the address bar", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlToken("/reset-password"), {
      wrapper: wrapperFor("/reset-password?token=abc123"),
    });

    expect(result.current).toBe("abc123");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
  });

  it("returns null and leaves the address bar alone when there is no token", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlToken("/verify-email"), {
      wrapper: wrapperFor("/verify-email"),
    });

    expect(result.current).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
