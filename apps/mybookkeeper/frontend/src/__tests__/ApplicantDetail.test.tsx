import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import ApplicantDetail from "@/app/pages/ApplicantDetail";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";

// --- mock applicant data ---

const baseApplicant: ApplicantDetailResponse = {
  id: "app-1",
  organization_id: "org-1",
  user_id: "user-1",
  inquiry_id: null,
  legal_name: "Jane Doe",
  dob: "1990-05-15",
  employer_or_hospital: "Memorial Hermann",
  vehicle_make_model: "Toyota Camry",
  id_document_storage_key: null,
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  smoker: false,
  pets: null,
  referred_by: null,
  stage: "lease_signed",
  tenant_ended_at: null,
  tenant_ended_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  screening_results: [],
  references: [],
  video_call_notes: [],
  events: [],
};

const defaultQueryState = {
  data: baseApplicant,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: vi.fn(() => defaultQueryState),
  useRestartTenancyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useTransitionApplicantStageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useEndTenancyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Stub RunScreeningButton and ScreeningResultsList to avoid deep mock chains
vi.mock("@/app/features/screening/RunScreeningButton", () => ({
  default: () => <button data-testid="stub-run-screening">Run KeyCheck</button>,
}));

vi.mock("@/app/features/screening/ScreeningResultsList", () => ({
  default: () => <div data-testid="stub-screening-results" />,
}));

vi.mock("@/app/features/screening/UploadScreeningResultModal", () => ({
  default: () => <div data-testid="stub-upload-modal" />,
}));

import { useGetApplicantByIdQuery } from "@/shared/store/applicantsApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

type QueryReturn = ReturnType<typeof useGetApplicantByIdQuery>;

function renderDetail(applicantId = "app-1") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/applicants/${applicantId}`]}>
        <Routes>
          <Route path="/applicants/:applicantId" element={<ApplicantDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("ApplicantDetail page", () => {
  beforeEach(() => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValue(
      defaultQueryState as unknown as QueryReturn,
    );
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  it("renders the applicant name as the page heading", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
  });

  it("shows the tenancy section for lease_signed stage applicant", () => {
    renderDetail();
    expect(screen.getByTestId("tenancy-section")).toBeInTheDocument();
  });

  it("shows 'End tenancy' button when tenancy is active", () => {
    renderDetail();
    expect(screen.getByTestId("end-tenancy-button")).toBeInTheDocument();
    expect(screen.queryByTestId("restart-tenancy-button")).toBeNull();
  });

  it("shows 'Restart tenancy' button when tenancy is ended", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: {
        ...baseApplicant,
        tenant_ended_at: "2026-05-01T12:00:00Z",
        tenant_ended_reason: "Lease not renewed",
      },
    } as unknown as QueryReturn);
    renderDetail();
    expect(screen.getByTestId("restart-tenancy-button")).toBeInTheDocument();
    expect(screen.queryByTestId("end-tenancy-button")).toBeNull();
  });

  it("shows ended date and reason when tenancy is ended", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: {
        ...baseApplicant,
        tenant_ended_at: "2026-05-01T12:00:00Z",
        tenant_ended_reason: "Lease not renewed",
      },
    } as unknown as QueryReturn);
    renderDetail();
    expect(screen.getByText(/Lease not renewed/i)).toBeInTheDocument();
  });

  it("does NOT show tenancy section for non-lease_signed stages", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: { ...baseApplicant, stage: "approved" },
    } as unknown as QueryReturn);
    renderDetail();
    expect(screen.queryByTestId("tenancy-section")).toBeNull();
  });

  it("does NOT show tenancy section for viewers (canWrite = false)", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    renderDetail();
    expect(screen.queryByTestId("tenancy-section")).toBeNull();
  });

  it("shows the source inquiry link when inquiry_id is set", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: { ...baseApplicant, inquiry_id: "inq-1" },
    } as unknown as QueryReturn);
    renderDetail();
    expect(screen.getByTestId("applicant-source-inquiry-link")).toBeInTheDocument();
  });

  it("hides the source inquiry link when inquiry_id is null", () => {
    renderDetail();
    expect(screen.queryByTestId("applicant-source-inquiry-link")).toBeNull();
  });

  it("shows the loading skeleton while fetching", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: undefined,
      isLoading: true,
    } as unknown as QueryReturn);
    renderDetail();
    expect(screen.getByTestId("applicant-detail-skeleton")).toBeInTheDocument();
  });

  it("shows an error alert when the query errors", () => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValueOnce({
      ...defaultQueryState,
      data: undefined,
      isError: true,
    } as unknown as QueryReturn);
    renderDetail();
    expect(
      screen.getByText(/I couldn't find that applicant/i),
    ).toBeInTheDocument();
  });
});
