import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import type { ListingSource } from "@/shared/types/listing/listing-source";
import { LISTING_SOURCES, LISTING_SOURCE_LABELS } from "@/shared/lib/listing-labels";

describe("SourceBadge", () => {
  it("renders the full label for each source by default", () => {
    for (const source of LISTING_SOURCES) {
      const { unmount } = render(<SourceBadge source={source} />);
      expect(screen.getByText(LISTING_SOURCE_LABELS[source])).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the short label when variant=short", () => {
    render(<SourceBadge source="FF" variant="short" />);
    expect(screen.getByText("FF")).toBeInTheDocument();
    expect(screen.queryByText("Furnished Finder")).not.toBeInTheDocument();
  });

  it("applies a distinct color class per source", () => {
    const colorClasses = new Set<string>();
    for (const source of LISTING_SOURCES) {
      const { unmount } = render(<SourceBadge source={source} />);
      const badge = screen.getByTestId(`source-badge-${source}`);
      // Capture the color portion of the className
      const match = badge.className.match(/bg-\w+-\d+/);
      if (match) colorClasses.add(match[0]);
      unmount();
    }
    // Each source should map to its own distinct color (no collisions across the four).
    expect(colorClasses.size).toBe(LISTING_SOURCES.length);
  });

  it("includes an aria-label naming the source for screen readers", () => {
    render(<SourceBadge source="TNH" />);
    const badge = screen.getByLabelText(/Travel Nurse Housing/i);
    expect(badge).toBeInTheDocument();
  });

  it("renders an icon (svg) alongside the text", () => {
    render(<SourceBadge source="Airbnb" />);
    const badge = screen.getByTestId("source-badge-Airbnb" as `source-badge-${ListingSource}`);
    const svg = badge.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
