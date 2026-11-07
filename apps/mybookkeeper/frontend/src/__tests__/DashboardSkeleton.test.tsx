import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardSkeleton from "@/app/features/dashboard/DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("renders the three summary-card placeholders in the loaded page's grid", () => {
    render(<DashboardSkeleton />);
    const cards = screen.getByTestId("dashboard-skeleton-summary-cards");
    expect(cards.children).toHaveLength(3);
    expect(cards).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-3");
  });

  it("keeps a filter-bar placeholder with the year filter and a slot per category preset", () => {
    render(<DashboardSkeleton />);
    const bar = screen.getByTestId("dashboard-skeleton-filter-bar");
    expect(bar).toContainElement(screen.getByTestId("dashboard-skeleton-year-filter"));
    expect(screen.getByTestId("dashboard-skeleton-presets").children).toHaveLength(3);
  });
});
