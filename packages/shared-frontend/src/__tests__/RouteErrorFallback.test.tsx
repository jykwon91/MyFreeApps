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

import { reloadOnceForStaleChunk } from "../lib/stale-chunk";
import { withRouteErrorBoundary } from "../components/errors/withRouteErrorBoundary";

const mockReloadOnce = vi.mocked(reloadOnceForStaleChunk);

function failingLazy(message: string) {
  return lazy<ComponentType>(() => Promise.reject(new TypeError(message)));
}

function Boom(): never {
  throw new Error("Cannot read properties of undefined (reading 'map')");
}

function renderAt(path: string, routes: RouteObject[]) {
  const router = createMemoryRouter(withRouteErrorBoundary(routes), { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  mockReloadOnce.mockReset();
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
    mockReloadOnce.mockReturnValue(true);
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
});
