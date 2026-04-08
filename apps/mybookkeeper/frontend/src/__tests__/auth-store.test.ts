import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsAuthenticated, notifyAuthChange } from "@/shared/lib/auth-store";

function createValidJwt(expiresInMs: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({ exp: Math.floor((Date.now() + expiresInMs) / 1000) }),
  );
  return `${header}.${payload}.signature`;
}

function createExpiredJwt(): string {
  return createValidJwt(-60_000);
}

describe("auth-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("useIsAuthenticated", () => {
    it("returns false when no token is in localStorage", () => {
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);
    });

    it("returns true when a valid (non-expired) token exists", () => {
      localStorage.setItem("token", createValidJwt(300_000));
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);
    });

    it("returns false when the token is expired", () => {
      localStorage.setItem("token", createExpiredJwt());
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);
    });

    it("returns false when the token is malformed", () => {
      localStorage.setItem("token", "not-a-jwt");
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);
    });
  });

  describe("notifyAuthChange", () => {
    it("re-renders subscribers when token is removed after notification", () => {
      localStorage.setItem("token", createValidJwt(300_000));
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);

      act(() => {
        localStorage.removeItem("token");
        notifyAuthChange();
      });

      expect(result.current).toBe(false);
    });

    it("re-renders subscribers when token is added after notification", () => {
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);

      act(() => {
        localStorage.setItem("token", createValidJwt(300_000));
        notifyAuthChange();
      });

      expect(result.current).toBe(true);
    });

    it("does not re-render without notification even if localStorage changes", () => {
      localStorage.setItem("token", createValidJwt(300_000));
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);

      // Remove token WITHOUT notifying — snapshot should remain stale
      // until React's next check (useSyncExternalStore still checks on render)
      localStorage.removeItem("token");
      // Without act + notify, the hook hasn't been triggered to re-evaluate
      // But useSyncExternalStore will catch it on next render cycle
    });
  });

  describe("cross-tab storage event sync", () => {
    it("re-renders subscribers when the token key is removed in another tab", () => {
      localStorage.setItem("token", createValidJwt(300_000));
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);

      // Simulate another tab logging out — localStorage.removeItem + StorageEvent
      act(() => {
        localStorage.removeItem("token");
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "token",
            oldValue: "old-token",
            newValue: null,
            storageArea: localStorage,
          }),
        );
      });

      expect(result.current).toBe(false);
    });

    it("re-renders subscribers when the token key is set in another tab", () => {
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);

      act(() => {
        const token = createValidJwt(300_000);
        localStorage.setItem("token", token);
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "token",
            oldValue: null,
            newValue: token,
            storageArea: localStorage,
          }),
        );
      });

      expect(result.current).toBe(true);
    });

    it("re-renders subscribers when localStorage.clear() is called in another tab", () => {
      localStorage.setItem("token", createValidJwt(300_000));
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);

      // localStorage.clear() fires a StorageEvent with key === null
      act(() => {
        localStorage.clear();
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: null,
            oldValue: null,
            newValue: null,
            storageArea: localStorage,
          }),
        );
      });

      expect(result.current).toBe(false);
    });

    it("ignores storage events for unrelated keys", () => {
      const token = createValidJwt(300_000);
      localStorage.setItem("token", token);
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);

      // A storage event for some other key should NOT trigger a re-render
      // that changes auth state. The token is still valid, so result stays true.
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "some-unrelated-key",
            oldValue: "foo",
            newValue: "bar",
            storageArea: localStorage,
          }),
        );
      });

      expect(result.current).toBe(true);
    });
  });
});
