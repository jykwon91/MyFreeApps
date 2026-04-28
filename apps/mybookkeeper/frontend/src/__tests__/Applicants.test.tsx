import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Applicants from "@/app/pages/Applicants";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import type { ApplicantListResponse } from "@/shared/types/applicant/applicant-list-response";

const mockApplicants: ApplicantSummary[] = [
  {
    id: "app-1",
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: "inq-1",
    legal_name: "Jane Doe",
    employer_or_hospital: "Memorial Hermann",
    contract_start: "2026-06-01",
    contract_end: "2026-09-30",
    stage: "lead",
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-04-25T10:00:00Z",
  },
  {
    id: "app-2",
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: "John Roe",
    employer_or_hospital: "Texas Children's",
    contract_start: null,
    contract_end: null,
    stage: "screening_pending",
    created_at: "2026-04-20T14:00:00Z",
    updated_at: "2026-04-20T14:00:00Z",
  },
];

const mockEnvelope: ApplicantListResponse = {
  items: mockApplicants,
  total: 2,
  has_more: false,
};

const defaultApplicantsState = {
  data: mockEnvelope,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: vi.fn(() => defaultApplicantsState),
  useGetApplicantByIdQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";

type ListQueryReturn = ReturnType<typeof useGetApplicantsQuery>;

function renderApplicants(initialEntry = "/applicants") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Applicants />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Applicants page", () => {
  beforeEach(() => {
    vi.mocked(useGetApplicantsQuery).mockReturnValue(
      defaultApplicantsState as unknown as ListQueryReturn,
    );
  });

  it("renders the heading and the list of applicants", () => {
    renderApplicants();
    expect(screen.getByRole("heading", { name: "Applicants" })).toBeInTheDocument();
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("John Roe").length).toBeGreaterThan(0);
  });

  it("renders the loading skeleton while fetching", () => {
    vi.mocked(useGetApplicantsQuery).mockReturnValueOnce({
      ...defaultApplicantsState,
      data: undefined,
      isLoading: true,
    } as unknown as ListQueryReturn);
    renderApplicants();
    expect(screen.getByTestId("applicants-skeleton")).toBeInTheDocument();
  });

  it("renders the empty state when there are no applicants", () => {
    vi.mocked(useGetApplicantsQuery).mockReturnValueOnce({
      ...defaultApplicantsState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as ListQueryReturn);
    renderApplicants();
    expect(screen.getByText(/No applicants yet/i)).toBeInTheDocument();
  });

  it("renders the filtered empty state when a stage filter has no matches", () => {
    vi.mocked(useGetApplicantsQuery).mockReturnValueOnce({
      ...defaultApplicantsState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as ListQueryReturn);
    renderApplicants("/applicants?stage=approved");
    expect(screen.getByText(/No applicants in this stage/i)).toBeInTheDocument();
  });

  it("renders an error AlertBox when the query errors", () => {
    vi.mocked(useGetApplicantsQuery).mockReturnValueOnce({
      ...defaultApplicantsState,
      data: undefined,
      isError: true,
    } as unknown as ListQueryReturn);
    renderApplicants();
    expect(screen.getByText(/I couldn't load your applicants/i)).toBeInTheDocument();
  });

  it("renders the stage filter chips", () => {
    renderApplicants();
    expect(screen.getByTestId("applicant-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("applicant-filter-lead")).toBeInTheDocument();
    expect(screen.getByTestId("applicant-filter-approved")).toBeInTheDocument();
  });

  it("hides the stage badge inside mobile cards when filtered to a single stage", () => {
    renderApplicants("/applicants?stage=lead");
    // The mobile card list should NOT contain a stage badge — that information
    // is implied by the active filter chip per RENTALS_PLAN.md §9.1.
    const mobileList = screen.getByTestId("applicants-mobile");
    expect(
      mobileList.querySelector('[data-testid^="applicant-stage-badge-"]'),
    ).toBeNull();
  });
});
