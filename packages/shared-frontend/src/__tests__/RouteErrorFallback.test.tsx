/**
 * RouteErrorFallback + withRouteErrorBoundary — the router-level half of the
 * stale-chunk recovery. A lazy route whose chunk fails to load must render
 * the "new version" prompt, not React Router's default developer screen.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";

vi.mock("../lib/stale-chunk", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/stale-chunk")>();
  return { ...mod, reloadOnceForStaleChunk: vi.fn() };
});

import { __resetStaleChunkStateForTests, reloadOnceForStaleChunk } from "../lib/stale-chunk";
import { withRouteErrorBoundary } from "../components/errors/withRouteErrorBoundary";
import { CAUGHT_ERROR_EVENT } from "../constants/caught-error-event";
import type { CaughtErrorDetail } from "../types/caught-error-detail";

const mockReloadOnce = vi.mocked(reloadOnceForStaleChunk);

function failingLazy(message: string) {
  return lazy<ComponentType>(() => Promise.reject(new TypeError(message)));
}

function Boom(): never {
  throw new Error("Cannot read properties of undefined (reading 'map')");
}

const CHUNK_ERROR = "Failed to fetch dynamically imported module: /assets/a-1234abcd.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

function renderAt(path: string, routes: RouteObject[]) {
  const router = createMemoryRouter(withRouteErrorBoundary(routes), { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

/** Renders `/x` with a lazy page and returns what was announced once `ready` (a button name) shows. */
async function announcedWhileRendering(
  Page: ComponentType,
  ready: RegExp = /^Reload$/,
): Promise<CaughtErrorDetail[]> {
  const announced: CaughtErrorDetail[] = [];
  const listener = (event: Event) => {
    if (event instanceof CustomEvent) announced.push(event.detail as CaughtErrorDetail);
  };
  window.addEventListener(CAUGHT_ERROR_EVENT, listener);
  try {
    renderAt("/x", [{ path: "/x", element: <Suspense fallback={<p>loading</p>}><Page /></Suspense> }]);
    expect(await screen.findByRole("button", { name: ready })).toBeInTheDocument();
  } finally {
    window.removeEventListener(CAUGHT_ERROR_EVENT, listener);
  }
  return announced;
}

beforeEach(() => {
  mockReloadOnce.mockReset();
  __resetStaleChunkStateForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("withRouteErrorBoundary", () => {
  it("renders routes unchanged when nothing fails", () => {
    renderAt("/ok", [{ path: "/ok", element: <p>page content</p> }]);
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("shows the new-version prompt (not the dev error screen) for a stale lazy chunk", async () => {
    mockReloadOnce.mockReturnValue(false); // guard already used — must show the prompt
    const Stale = failingLazy(
      "error loading dynamically imported module: https://mygamingassistant.myfreeapps.org/assets/WowProfessionsPage-BY91k5ug.js",
    );
    renderAt("/wow-forever/professions", [
      {
        path: "/wow-forever/professions",
        element: (
          <Suspense fallback={<p>loading</p>}>
            <Stale />
          </Suspense>
        ),
      },
    ]);

    expect(await screen.findByText("A new version was released")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
    expect(mockReloadOnce).toHaveBeenCalledTimes(1);
  });

  it("shows the reloading state when the guarded auto-reload fires", async () => {
    // The real guard with the page reload stubbed, so it marks the reload as scheduled like production does.
    const actual = await vi.importActual<typeof import("../lib/stale-chunk")>("../lib/stale-chunk");
    mockReloadOnce.mockImplementation(() =>
      actual.reloadOnceForStaleChunk({ storage: memoryStorage(), pathname: "/x", now: Date.now(), reload: vi.fn() }),
    );
    const Stale = failingLazy("Failed to fetch dynamically imported module: /assets/a-1234abcd.js");
    renderAt("/x", [
      {
        path: "/x",
        element: (
          <Suspense fallback={<p>loading</p>}>
            <Stale />
          </Suspense>
        ),
      },
    ]);

    expect(await screen.findByRole("button", { name: /Reloading/ })).toBeDisabled();
  });

  it("shows a generic error (and never auto-reloads) for a non-chunk error", async () => {
    renderAt("/boom", [{ path: "/boom", element: <Boom /> }]);

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/reading 'map'/)).toBeInTheDocument();
    expect(mockReloadOnce).not.toHaveBeenCalled();
  });

  it("puts the fallback in one main landmark, since it replaces the shell", async () => {
    renderAt("/boom", [{ path: "/boom", element: <Boom /> }]);

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("alert"));
  });

  it("announces the caught error on window, so the mocked e2e suites fail on it", async () => {
    const announced: CaughtErrorDetail[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) announced.push(event.detail as CaughtErrorDetail);
    };
    window.addEventListener(CAUGHT_ERROR_EVENT, listener);
    try {
      renderAt("/boom", [{ path: "/boom", element: <Boom /> }]);
      expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    } finally {
      window.removeEventListener(CAUGHT_ERROR_EVENT, listener);
    }

    expect(announced.length).toBeGreaterThan(0);
    expect(announced[0]).toMatchObject({
      source: "RouteErrorFallback",
      name: "Error",
      message: "Cannot read properties of undefined (reading 'map')",
    });
  });

  it("announces a route Response (no route matched) by its status", async () => {
    const announced: CaughtErrorDetail[] = [];
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) announced.push(event.detail as CaughtErrorDetail);
    };
    window.addEventListener(CAUGHT_ERROR_EVENT, listener);
    try {
      renderAt("/nowhere", [{ path: "/ok", element: <p>page content</p> }]);
      expect(await screen.findByText("404 Not Found")).toBeInTheDocument();
    } finally {
      window.removeEventListener(CAUGHT_ERROR_EVENT, listener);
    }

    expect(announced[0]).toMatchObject({ source: "RouteErrorFallback", name: "RouteErrorResponse", message: "404 Not Found" });
  });

  it("announces a stale chunk when the reload guard declines, since the page is stuck on the prompt", async () => {
    mockReloadOnce.mockReturnValue(false);
    const announced = await announcedWhileRendering(failingLazy(CHUNK_ERROR));

    expect(announced).toEqual([
      expect.objectContaining({ source: "RouteErrorFallback", name: "TypeError", message: CHUNK_ERROR }),
    ]);
  });

  it("does not announce a stale chunk the page is reloading away from", async () => {
    const actual = await vi.importActual<typeof import("../lib/stale-chunk")>("../lib/stale-chunk");
    // The real guard, so it records the reload as scheduled; the reload itself does nothing.
    mockReloadOnce.mockImplementation(() =>
      actual.reloadOnceForStaleChunk({ storage: memoryStorage(), pathname: "/x", now: Date.now(), reload: () => {} }),
    );
    const announced = await announcedWhileRendering(failingLazy(CHUNK_ERROR), /Reloading/);

    expect(mockReloadOnce).toHaveBeenCalledTimes(1);
    expect(announced).toEqual([]);
  });
});
