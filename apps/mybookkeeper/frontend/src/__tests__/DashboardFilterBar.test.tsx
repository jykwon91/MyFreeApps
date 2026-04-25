import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardFilterBar from "@/app/features/dashboard/DashboardFilterBar";
import { ALL_DASHBOARD_CATEGORIES } from "@/shared/lib/dashboard-filter-config";
import type { CategoryFilterState } from "@/shared/types/dashboard/category-filter";
import type { Property } from "@/shared/types/property/property";

const mockProperties: Property[] = [
  { id: "p1", name: "Property A", address: null, classification: "investment", type: "short_term", is_active: true, activity_periods: [], created_at: "2025-01-01" },
  { id: "p2", name: "Property B", address: null, classification: "investment", type: "short_term", is_active: true, activity_periods: [], created_at: "2025-01-01" },
];

function makeFilterState(overrides?: Partial<CategoryFilterState>): CategoryFilterState {
  return {
    selectedCategories: new Set(ALL_DASHBOARD_CATEGORIES),
    preset: "all",
    ...overrides,
  };
}

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    filterState: makeFilterState(),
    onToggleCategory: vi.fn(),
    onSelectOnlyCategory: vi.fn(),
    onSetPreset: vi.fn(),
    onResetCategories: vi.fn(),
    isFiltered: false,
    properties: [] as Property[],
    selectedPropertyIds: [] as string[],
    onPropertyIdsChange: vi.fn(),
    ...overrides,
  };
}

describe("DashboardFilterBar", () => {
  it("renders the filter bar with preset buttons", () => {
    render(<DashboardFilterBar {...defaultProps()} />);

    expect(screen.getByTestId("dashboard-filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("filter-preset-all")).toBeInTheDocument();
    expect(screen.getByTestId("filter-preset-income")).toBeInTheDocument();
    expect(screen.getByTestId("filter-preset-expenses")).toBeInTheDocument();
  });

  it("calls onSetPreset when a preset button is clicked", async () => {
    const user = userEvent.setup();
    const onSetPreset = vi.fn();

    render(<DashboardFilterBar {...defaultProps({ onSetPreset })} />);

    await user.click(screen.getByTestId("filter-preset-income"));
    expect(onSetPreset).toHaveBeenCalledWith("income");

    await user.click(screen.getByTestId("filter-preset-expenses"));
    expect(onSetPreset).toHaveBeenCalledWith("expenses");
  });

  it("shows filter count when isFiltered is true", () => {
    render(
      <DashboardFilterBar
        {...defaultProps({
          filterState: makeFilterState({
            selectedCategories: new Set(["utilities", "maintenance"]),
          }),
          isFiltered: true,
        })}
      />,
    );

    expect(screen.getByTestId("filter-count")).toBeInTheDocument();
    expect(screen.getByTestId("filter-count")).toHaveTextContent("2 of");
  });

  it("does not show filter count when not filtered", () => {
    render(<DashboardFilterBar {...defaultProps()} />);
    expect(screen.queryByTestId("filter-count")).not.toBeInTheDocument();
  });

  it("expands to show category chips when expand button is clicked", async () => {
    const user = userEvent.setup();
    render(<DashboardFilterBar {...defaultProps()} />);

    expect(screen.queryByTestId("filter-categories-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("filter-expand-toggle"));

    const panel = screen.getByTestId("filter-categories-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("Income")).toBeInTheDocument();
    expect(within(panel).getByText("Expenses")).toBeInTheDocument();
  });

  it("collapses category panel when expand button is clicked again", async () => {
    const user = userEvent.setup();
    render(<DashboardFilterBar {...defaultProps()} />);

    await user.click(screen.getByTestId("filter-expand-toggle"));
    expect(screen.getByTestId("filter-categories-panel")).toBeInTheDocument();

    await user.click(screen.getByTestId("filter-expand-toggle"));
    expect(screen.queryByTestId("filter-categories-panel")).not.toBeInTheDocument();
  });

  it("calls onSelectOnlyCategory when a chip is clicked with all categories selected", async () => {
    const user = userEvent.setup();
    const onSelectOnlyCategory = vi.fn();
    render(<DashboardFilterBar {...defaultProps({ onSelectOnlyCategory })} />);

    await user.click(screen.getByTestId("filter-expand-toggle"));
    await user.click(screen.getByText("Utilities"));
    expect(onSelectOnlyCategory).toHaveBeenCalledWith("utilities");
  });

  it("calls onToggleCategory when a chip is clicked with some categories filtered", async () => {
    const user = userEvent.setup();
    const onToggleCategory = vi.fn();
    render(
      <DashboardFilterBar
        {...defaultProps({
          filterState: makeFilterState({
            selectedCategories: new Set(["utilities", "maintenance"]),
          }),
          isFiltered: true,
          onToggleCategory,
        })}
      />,
    );

    await user.click(screen.getByTestId("filter-expand-toggle"));
    await user.click(screen.getByText("Utilities"));
    expect(onToggleCategory).toHaveBeenCalledWith("utilities");
  });

  it("shows category chips with correct aria-pressed state", async () => {
    const user = userEvent.setup();
    render(
      <DashboardFilterBar
        {...defaultProps({
          filterState: makeFilterState({
            selectedCategories: new Set(["utilities", "maintenance"]),
          }),
          isFiltered: true,
        })}
      />,
    );

    await user.click(screen.getByTestId("filter-expand-toggle"));

    const utilitiesChip = screen.getByText("Utilities").closest("button");
    expect(utilitiesChip).toHaveAttribute("aria-pressed", "true");

    const insuranceChip = screen.getByText("Insurance").closest("button");
    expect(insuranceChip).toHaveAttribute("aria-pressed", "false");
  });

  it("shows property multi-select when properties are provided", () => {
    render(
      <DashboardFilterBar {...defaultProps({ properties: mockProperties })} />,
    );
    expect(screen.getByTestId("property-filter-trigger")).toBeInTheDocument();
    expect(screen.getByText("All Properties")).toBeInTheDocument();
  });

  it("does not show property multi-select when no properties", () => {
    render(<DashboardFilterBar {...defaultProps()} />);
    expect(screen.queryByTestId("property-filter-trigger")).not.toBeInTheDocument();
  });

  it("shows reset button when category filter is active", async () => {
    const user = userEvent.setup();
    render(
      <DashboardFilterBar
        {...defaultProps({
          filterState: makeFilterState({
            selectedCategories: new Set(["utilities"]),
          }),
          isFiltered: true,
        })}
      />,
    );
    // Expand the panel first — reset button is inside expanded section
    await user.click(screen.getByTestId("filter-expand-toggle"));
    expect(screen.getByTestId("filter-clear")).toBeInTheDocument();
  });

  it("shows reset button when property filter is active", async () => {
    const user = userEvent.setup();
    render(
      <DashboardFilterBar
        {...defaultProps({
          properties: mockProperties,
          selectedPropertyIds: ["p1"],
        })}
      />,
    );
    await user.click(screen.getByTestId("filter-expand-toggle"));
    expect(screen.getByTestId("filter-clear")).toBeInTheDocument();
  });

  it("calls both reset callbacks when reset is clicked", async () => {
    const user = userEvent.setup();
    const onResetCategories = vi.fn();
    const onPropertyIdsChange = vi.fn();

    render(
      <DashboardFilterBar
        {...defaultProps({
          filterState: makeFilterState({
            selectedCategories: new Set(["utilities"]),
          }),
          isFiltered: true,
          onResetCategories,
          onPropertyIdsChange,
        })}
      />,
    );

    // Expand the panel first — reset button is inside expanded section
    await user.click(screen.getByTestId("filter-expand-toggle"));
    await user.click(screen.getByTestId("filter-clear"));
    expect(onResetCategories).toHaveBeenCalled();
    expect(onPropertyIdsChange).toHaveBeenCalledWith([]);
  });
});
