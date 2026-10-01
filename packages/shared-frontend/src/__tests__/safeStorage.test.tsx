/**
 * Blocked Web Storage — Chrome with third-party cookies blocked (every
 * Incognito window) throws a SecurityError on storage access inside a
 * third-party iframe such as a Discord Activity. The shared API client, auth
 * store and theme toggle must degrade to "nothing stored", not crash.
 */
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../components/ui/ThemeToggle";
import api from "../lib/api";
import { useIsAuthenticated } from "../lib/auth-store";
import {
  readLocalStorage,
  readSessionStorage,
  removeLocalStorage,
  writeLocalStorage,
  writeSessionStorage,
} from "../lib/safeStorage";

function securityError(): DOMException {
  return new DOMException("The operation is insecure.", "SecurityError");
}

function blockStorage(): void {
  const blocked = (): never => {
    throw securityError();
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
}

/** A JWT whose payload says it expires in an hour (the auth store only reads `exp`). */
function liveToken(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}

function setSystemPrefersDark(isDark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && isDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("safeStorage", () => {
  it("reads, writes and removes like Web Storage when storage works", () => {
    writeLocalStorage("v1_theme", "dark");
    writeSessionStorage("tab", "forms");
    expect(readLocalStorage("v1_theme")).toBe("dark");
    expect(readSessionStorage("tab")).toBe("forms");
    removeLocalStorage("v1_theme");
    expect(readLocalStorage("v1_theme")).toBeNull();
    expect(localStorage.getItem("v1_theme")).toBeNull();
  });

  it("reads blocked storage as empty instead of throwing", () => {
    blockStorage();
    expect(readLocalStorage("token")).toBeNull();
    expect(readSessionStorage("tab")).toBeNull();
  });

  it("drops writes and removals storage refuses", () => {
    blockStorage();
    expect(() => writeLocalStorage("v1_theme", "dark")).not.toThrow();
    expect(() => writeSessionStorage("tab", "forms")).not.toThrow();
    expect(() => removeLocalStorage("token")).not.toThrow();
  });

  it("drops a write that overflows the quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(() => writeLocalStorage("v1_theme", "dark")).not.toThrow();
  });
});

describe("with storage blocked", () => {
  it("the API client still sends requests, unauthenticated", async () => {
    blockStorage();
    const seen: InternalAxiosRequestConfig[] = [];
    const response = await api.get("/games", {
      adapter: async (config) => {
        seen.push(config);
        return { data: [], status: 200, statusText: "OK", headers: {}, config };
      },
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.headers.Authorization).toBeUndefined();
  });

  it("the API client keeps sending the token when storage works", async () => {
    localStorage.setItem("token", "abc.def.ghi");
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/games", {
      adapter: async (config) => {
        seen.push(config);
        return { data: [], status: 200, statusText: "OK", headers: {}, config };
      },
    });
    expect(seen[0]?.headers.Authorization).toBe("Bearer abc.def.ghi");
  });

  it("the auth store reads as signed out", () => {
    localStorage.setItem("token", liveToken());
    expect(renderHook(() => useIsAuthenticated()).result.current).toBe(true);

    blockStorage();
    expect(renderHook(() => useIsAuthenticated()).result.current).toBe(false);
  });

  it("the theme toggle still switches the theme for the session", async () => {
    setSystemPrefersDark(false);
    blockStorage();
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
  });
});
