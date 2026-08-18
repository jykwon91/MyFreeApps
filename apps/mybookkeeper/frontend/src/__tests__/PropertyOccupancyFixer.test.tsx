/**
 * Unit tests for the in-place occupancy shortcut on a blocked loan card.
 *
 * Three things are load-bearing. The control appears only when the property is
 * genuinely unclassified — read from the property, not matched against the
 * blocker's wording, so a reworded message can never silently retire it. Naming
 * a rental also sends a letting type, because the properties table rejects the
 * pair without one. And clearing the blocker re-runs the check, since the whole
 * point is not having to remember to come back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PropertyOccupancyFixer from "@/app/features/mortgages/PropertyOccupancyFixer";
import type { Property } from "@/shared/types/property/property";

const mockUnwrap = vi.fn(() => Promise.resolve({}));
const mockUpdateProperty = vi.fn(() => ({ unwrap: mockUnwrap }));
let mockProperties: Property[] = [];

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: mockProperties })),
  useUpdatePropertyMutation: vi.fn(() => [mockUpdateProperty, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const PROPERTY: Property = {
  id: "property-1",
  name: "6734 Peerless",
  address: "6734 Peerless St",
  classification: "unclassified",
  type: null,
  is_active: true,
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

const onFixed = vi.fn();

function renderFixer(propertyId = "property-1") {
  return render(
    <PropertyOccupancyFixer propertyId={propertyId} onFixed={onFixed} />,
  );
}

describe("PropertyOccupancyFixer — when it renders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProperties = [PROPERTY];
  });

  it("offers the choice on an unclassified property", () => {
    renderFixer();
    expect(screen.getByTestId("property-occupancy-fixer")).toBeInTheDocument();
  });

  it("renders nothing once the property has an occupancy", () => {
    mockProperties = [{ ...PROPERTY, classification: "primary_residence" }];
    renderFixer();
    expect(screen.queryByTestId("property-occupancy-fixer")).not.toBeInTheDocument();
  });

  it("renders nothing when the property is not in the list", () => {
    mockProperties = [];
    renderFixer();
    expect(screen.queryByTestId("property-occupancy-fixer")).not.toBeInTheDocument();
  });

  it("does not offer 'not sure yet' — that is the state being fixed", () => {
    renderFixer();
    expect(screen.getByText("Investment Property")).toBeInTheDocument();
    expect(screen.getByText("Primary Residence")).toBeInTheDocument();
    expect(screen.getByText("Second Home")).toBeInTheDocument();
    expect(screen.queryByText("Not Sure Yet")).not.toBeInTheDocument();
  });
});

describe("PropertyOccupancyFixer — saving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProperties = [PROPERTY];
  });

  it("keeps the save disabled until a choice is made", () => {
    renderFixer();
    expect(screen.getByTestId("property-occupancy-save-button")).toBeDisabled();
  });

  it("saves an owner-occupied answer without a letting type", async () => {
    const user = userEvent.setup();
    renderFixer();
    await user.click(screen.getByText("Primary Residence"));
    await user.click(screen.getByTestId("property-occupancy-save-button"));

    expect(mockUpdateProperty).toHaveBeenCalledWith({
      id: "property-1",
      data: { classification: "primary_residence" },
    });
  });

  it("asks for the letting type only once a rental is named", async () => {
    const user = userEvent.setup();
    renderFixer();
    expect(
      screen.queryByTestId("property-occupancy-rental-type"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Investment Property"));
    expect(screen.getByTestId("property-occupancy-rental-type")).toBeInTheDocument();
  });

  it("sends the letting type with a rental, which the row requires", async () => {
    // classification=investment without a type violates the properties table's
    // check constraint — the save would 500 rather than clear the blocker.
    const user = userEvent.setup();
    renderFixer();
    await user.click(screen.getByText("Investment Property"));
    await user.selectOptions(
      screen.getByTestId("property-occupancy-rental-type"),
      "long_term",
    );
    await user.click(screen.getByTestId("property-occupancy-save-button"));

    expect(mockUpdateProperty).toHaveBeenCalledWith({
      id: "property-1",
      data: { classification: "investment", type: "long_term" },
    });
  });

  it("re-runs the rate check once the blocker is cleared", async () => {
    const user = userEvent.setup();
    renderFixer();
    await user.click(screen.getByText("Second Home"));
    await user.click(screen.getByTestId("property-occupancy-save-button"));

    expect(onFixed).toHaveBeenCalled();
  });

  it("does not re-run the check when the save fails", async () => {
    mockUnwrap.mockRejectedValueOnce(new Error("nope"));
    const user = userEvent.setup();
    renderFixer();
    await user.click(screen.getByText("Second Home"));
    await user.click(screen.getByTestId("property-occupancy-save-button"));

    expect(onFixed).not.toHaveBeenCalled();
  });
});
