import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import SortIndicator from "@/shared/components/table/SortIndicator";
import type { Header } from "@tanstack/react-table";

function makeHeader(sortState: false | "asc" | "desc"): Header<unknown, unknown> {
  return {
    column: {
      getIsSorted: vi.fn(() => sortState),
    },
  } as unknown as Header<unknown, unknown>;
}

describe("SortIndicator", () => {
  it("renders ascending chevron when column is sorted asc", () => {
    const { container } = render(<SortIndicator header={makeHeader("asc")} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders descending chevron when column is sorted desc", () => {
    const { container } = render(<SortIndicator header={makeHeader("desc")} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders nothing when column is not sorted", () => {
    const { container } = render(<SortIndicator header={makeHeader(false)} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders different icons for asc vs desc", () => {
    const { container: ascContainer } = render(<SortIndicator header={makeHeader("asc")} />);
    const { container: descContainer } = render(<SortIndicator header={makeHeader("desc")} />);

    const ascPath = ascContainer.querySelector("svg")?.innerHTML;
    const descPath = descContainer.querySelector("svg")?.innerHTML;
    expect(ascPath).not.toEqual(descPath);
  });
});
