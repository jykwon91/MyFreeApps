import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Tenants from "@/app/pages/Tenants";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import type { TenantListResponse } from "@/shared/types/applicant/tenant-list-response";

const mockTenants: ApplicantSummary[] = [
  {
    id: "app-1",
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: "Jane Doe",
    employer_or_hospital: "Memorial Hermann",
    contract_start: "2026-01-01",
    contract_end: "2026-12-31",
    stage: "lease_signed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "app-2",
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: "John Roe",
    employer_or_hospital: "Texas Children's",
    contract_start: "2026-02-01",
    contract_end: "2026-08-31",
    stage: "lease_signed",
    tenant_ended_at: "2026-07-01T00:00:00Z",
    tenant_ended_reason: "Lease not renewed",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  },
];

const defaultEnvelope: TenantListResponse = {
  items: mockTenants,
  total: 2,
  has_more: false,
};

const defaultQueryState = {
  data: defaultEnvelope,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetTenantsQuery: vi.fn(() => defaultQueryState),
}));

import { useGetTenantsQuery } from "@/shared/store/applicantsApi";

type QueryReturn = ReturnType<typeof useGetTenantsQuery>;

function renderTenants() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Tenants />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Tenants page", () => {
  beforeEach(() => {
    vi.mocked(useGetTenantsQuery).mockReturnValue(
      defaultQueryState as unknown as QueryReturn,
    );
  });

  it("renders the heading", () => {
    renderTenants();
    expect(screen.getByRole("heading", { name: "Tenants" })).toBeInTheDocument();
  });

  it("renders the 'Show ended tenants' toggle", () => {
    renderTenants();
    expect(screen.getByTestId("tenants-show-ended-toggle")).toBeInTheDocument();
  });

  it("renders the skeleton while loading", () => {
    vi.mocked(useGetTenantsQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: undefined,
      isLoading: true,
    } as unknown as QueryReturn);
    renderTenants();
    expect(screen.getByTestId("tenants-skeleton")).toBeInTheDocument();
  });

  it("renders empty state for active when no tenants and toggle is off", () => {
    vi.mocked(useGetTenantsQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as QueryReturn);
    renderTenants();
    expect(
      screen.getByText(/No active tenants/i),
    ).toBeInTheDocument();
  });

  it("renders 'No tenants found' empty state when toggle is on and no tenants", () => {
    // Mock returns empty for all calls (both initial render and after toggle)
    vi.mocked(useGetTenantsQuery).mockReturnValue({
      ...defaultQueryState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as QueryReturn);
    renderTenants();
    // Toggle on — now includeEnded=true, shows different empty message
    fireEvent.click(screen.getByTestId("tenants-show-ended-toggle"));
    expect(screen.getByText(/No tenants found/i)).toBeInTheDocument();
  });

  it("renders error alert when query errors", () => {
    vi.mocked(useGetTenantsQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: undefined,
      isError: true,
    } as unknown as QueryReturn);
    renderTenants();
    expect(
      screen.getByText(/I couldn't load your tenants/i),
    ).toBeInTheDocument();
  });

  it("calls query with include_ended=false by default", () => {
    renderTenants();
    expect(vi.mocked(useGetTenantsQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ include_ended: false }),
    );
  });

  it("calls query with include_ended=true after toggling", () => {
    renderTenants();
    fireEvent.click(screen.getByTestId("tenants-show-ended-toggle"));
    expect(vi.mocked(useGetTenantsQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ include_ended: true }),
    );
  });

  it("renders tenant names in mobile card list", () => {
    renderTenants();
    const mobileList = screen.getByTestId("tenants-mobile");
    expect(mobileList).toBeInTheDocument();
    expect(mobileList.textContent).toContain("Jane Doe");
    expect(mobileList.textContent).toContain("John Roe");
  });
});
