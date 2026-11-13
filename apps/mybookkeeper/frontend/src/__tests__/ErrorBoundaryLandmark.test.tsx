/**
 * The app-level ErrorBoundary replaces the whole app, Layout included, so its
 * fallback is the page's one main landmark. PageErrorBoundary renders inside
 * Layout's <main>, so it adds none.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/shared/components/ErrorBoundary";
import PageErrorBoundary from "@/shared/components/PageErrorBoundary";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn().mockResolvedValue({}) },
}));

function Crash(): never {
  throw new TypeError("Cannot convert undefined or null to object");
}

function StaleChunk(): never {
  throw new TypeError("Failed to fetch dynamically imported module: /assets/Page-1234abcd.js");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("shows a crash in one main landmark", () => {
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveTextContent("Something went wrong");
  });

  it("shows the new-version prompt in one main landmark", () => {
    render(
      <ErrorBoundary>
        <StaleChunk />
      </ErrorBoundary>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveTextContent("A new version was released");
  });

  it("adds no landmark while its children render", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});

describe("PageErrorBoundary", () => {
  it("adds no main landmark of its own, since it renders inside Layout's", () => {
    render(
      <PageErrorBoundary>
        <Crash />
      </PageErrorBoundary>,
    );

    expect(screen.getByText(/wasn't supposed to happen/)).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
