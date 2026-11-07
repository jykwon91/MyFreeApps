import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import AttributionReviewSkeleton from "@/app/features/attribution/AttributionReviewSkeleton";

describe("AttributionReviewSkeleton", () => {
  it("renders three rows, each with the loaded item's main and actions columns", () => {
    render(<AttributionReviewSkeleton />);
    const rows = screen.getAllByTestId("attribution-review-skeleton-row");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(within(row).getByTestId("attribution-review-skeleton-main")).toBeInTheDocument();
      expect(within(row).getByTestId("attribution-review-skeleton-actions")).toBeInTheDocument();
    }
  });
});
