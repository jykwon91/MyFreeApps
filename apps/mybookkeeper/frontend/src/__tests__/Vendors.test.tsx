import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Vendors from "@/app/pages/Vendors";
import type { VendorSummary } from "@/shared/types/vendor/vendor-summary";
import type { VendorListResponse } from "@/shared/types/vendor/vendor-list-response";

const mockVendors: VendorSummary[] = [
  {
    id: "vendor-1",
    organization_id: "org-1",
    user_id: "user-1",
    name: "Bob's Plumbing",
    category: "plumber",
    hourly_rate: "125.00",
    preferred: true,
    last_used_at: "2026-04-01T10:00:00Z",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "vendor-2",
    organization_id: "org-1",
    user_id: "user-1",
    name: "Sparky Electric",
    category: "electrician",
    hourly_rate: null,
    preferred: false,
    last_used_at: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
  },
];

const mockEnvelope: VendorListResponse = {
  items: mockVendors,
  total: 2,
  has_more: false,
};

const defaultVendorsState = {
  data: mockEnvelope,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

const createVendor = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const updateVendor = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const deleteVendor = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock("@/shared/store/vendorsApi", () => ({
  useGetVendorsQuery: vi.fn(() => defaultVendorsState),
  useGetVendorByIdQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCreateVendorMutation: () => [createVendor, { isLoading: false }],
  useUpdateVendorMutation: () => [updateVendor, { isLoading: false }],
  useDeleteVendorMutation: () => [deleteVendor, { isLoading: false }],
}));

import { useGetVendorsQuery } from "@/shared/store/vendorsApi";

type ListQueryReturn = ReturnType<typeof useGetVendorsQuery>;

function renderVendors(initialEntry = "/vendors") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Vendors />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Vendors page", () => {
  beforeEach(() => {
    vi.mocked(useGetVendorsQuery).mockReturnValue(
      defaultVendorsState as unknown as ListQueryReturn,
    );
  });

  it("renders the heading and the rolodex of vendors", () => {
    renderVendors();
    expect(screen.getByRole("heading", { name: "Vendors" })).toBeInTheDocument();
    expect(screen.getAllByText("Bob's Plumbing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sparky Electric").length).toBeGreaterThan(0);
  });

  it("renders the loading skeleton while fetching", () => {
    vi.mocked(useGetVendorsQuery).mockReturnValueOnce({
      ...defaultVendorsState,
      data: undefined,
      isLoading: true,
    } as unknown as ListQueryReturn);
    renderVendors();
    expect(screen.getByTestId("vendors-skeleton")).toBeInTheDocument();
  });

  it("renders the empty state when there are no vendors", () => {
    vi.mocked(useGetVendorsQuery).mockReturnValueOnce({
      ...defaultVendorsState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as ListQueryReturn);
    renderVendors();
    expect(screen.getByText(/No vendors yet/i)).toBeInTheDocument();
  });

  it("renders the filtered empty state when a category filter has no matches", () => {
    vi.mocked(useGetVendorsQuery).mockReturnValueOnce({
      ...defaultVendorsState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as ListQueryReturn);
    renderVendors("/vendors?category=hvac");
    expect(screen.getByText(/No vendors match this filter/i)).toBeInTheDocument();
  });

  it("renders an error AlertBox when the query errors", () => {
    vi.mocked(useGetVendorsQuery).mockReturnValueOnce({
      ...defaultVendorsState,
      data: undefined,
      isError: true,
    } as unknown as ListQueryReturn);
    renderVendors();
    expect(screen.getByText(/I couldn't load your vendors/i)).toBeInTheDocument();
  });

  it("renders the category filter chips and preferred toggle", () => {
    renderVendors();
    expect(screen.getByTestId("vendor-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("vendor-filter-plumber")).toBeInTheDocument();
    expect(screen.getByTestId("vendor-filter-hvac")).toBeInTheDocument();
    expect(screen.getByTestId("vendor-preferred-toggle")).toBeInTheDocument();
  });

  it("hides the category badge inside mobile cards when filtered to a single category", () => {
    renderVendors("/vendors?category=plumber");
    // The mobile card list should NOT contain a category badge — that
    // information is implied by the active filter chip.
    const mobileList = screen.getByTestId("vendors-mobile");
    expect(
      mobileList.querySelector('[data-testid^="vendor-category-badge-"]'),
    ).toBeNull();
  });

  it("renders the preferred star for preferred vendors only", () => {
    renderVendors();
    // Bob's Plumbing is preferred, Sparky Electric is not.
    expect(
      screen.getAllByTestId("vendor-preferred-star-vendor-1").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("vendor-preferred-star-vendor-2")).toBeNull();
  });

  it("reflects ?preferred=true in the toggle's pressed state", () => {
    renderVendors("/vendors?preferred=true");
    const toggle = screen.getByTestId("vendor-preferred-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
});
