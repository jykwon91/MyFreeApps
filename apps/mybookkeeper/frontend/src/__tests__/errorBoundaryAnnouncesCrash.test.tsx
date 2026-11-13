/**
 * MyBookkeeper's error boundaries announce every crash they catch
 * (CAUGHT_ERROR_EVENT), so the no-backend Playwright suite fails a test whose
 * page crashed into a fallback while the rest of the app still rendered.
 */
import type { ComponentType, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAUGHT_ERROR_EVENT, reloadOnceForStaleChunk, type CaughtErrorDetail } from "@platform/ui";
import ErrorBoundary from "@/shared/components/ErrorBoundary";
import PageErrorBoundary from "@/shared/components/PageErrorBoundary";
import api from "@/shared/lib/api";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

const CRASH = "Cannot convert undefined or null to object";

const CHUNK_ERROR = "Failed to fetch dynamically imported module: /assets/Page-1234abcd.js";

function Crash(): never {
  throw new TypeError(CRASH);
}

function StaleChunk(): never {
  throw new TypeError(CHUNK_ERROR);
}

const announced: CaughtErrorDetail[] = [];
function record(event: Event): void {
  if (event instanceof CustomEvent) announced.push(event.detail as CaughtErrorDetail);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(api.post).mockResolvedValue({});
  window.addEventListener(CAUGHT_ERROR_EVENT, record);
});

afterEach(() => {
  window.removeEventListener(CAUGHT_ERROR_EVENT, record);
  announced.length = 0;
  vi.restoreAllMocks();
});

const BOUNDARIES: [string, ComponentType<{ children: ReactNode }>][] = [
  ["ErrorBoundary", ErrorBoundary],
  ["PageErrorBoundary", PageErrorBoundary],
];

describe.each(BOUNDARIES)("%s", (source, Boundary) => {
  it("announces the crash it caught", () => {
    render(
      <Boundary>
        <Crash />
      </Boundary>,
    );

    expect(screen.getAllByText(new RegExp(`${CRASH}|wasn't supposed to happen`)).length).toBeGreaterThan(0);
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({ source, name: "TypeError", message: CRASH });
  });

  it("announces a stale chunk nothing is reloading for, since the page is stuck on the prompt", () => {
    render(
      <Boundary>
        <StaleChunk />
      </Boundary>,
    );

    expect(screen.getByText("A new version was released")).toBeInTheDocument();
    expect(announced).toEqual([expect.objectContaining({ source, message: CHUNK_ERROR })]);
  });

  it("announces nothing when its children render", () => {
    render(
      <Boundary>
        <p>fine</p>
      </Boundary>,
    );

    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(announced).toEqual([]);
  });
});

// Last in the file: a scheduled reload stays scheduled for the page's lifetime (vitest gives each
// file its own module state), so every test after this would see it.
describe("while a stale-chunk reload is scheduled", () => {
  it.each(BOUNDARIES)("%s stays quiet about the chunk error, which the reload recovers from", (_source, Boundary) => {
    const store = new Map<string, string>();
    reloadOnceForStaleChunk({
      storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
      pathname: "/reloading",
      now: Date.now(),
      reload: () => {},
    });

    render(
      <Boundary>
        <StaleChunk />
      </Boundary>,
    );

    expect(screen.getByText("A new version was released")).toBeInTheDocument();
    expect(announced).toEqual([]);
  });
});
