import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import ApplicantDetail from "@/app/pages/ApplicantDetail";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";

// --- mock applicant data ---

const baseApplicant: ApplicantDetailResponse = {
  id: "app-1",
  organization_id: "org-1",
  user_id: "user-1",
  inquiry_id: null,
  legal_name: "Jane Doe",
  employer_or_hospital: "Memorial Hermann",
  has_contact_email: false,
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

vi.mock("@mybookkeeper/api-client/store/applicantsApi", () => ({
  useGetApplicantByIdQuery: vi.fn(() => defaultQueryState),
  useRestartTenancyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRevealApplicantSensitiveMutation: vi.fn(() => [vi.fn(), { isLoading: false, reset: vi.fn() }]),
  useTransitionApplicantStageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useEndTenancyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateApplicantContractDatesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Stub ScreeningSection to avoid deep mock chains (replaces old
// RunScreeningButton / ScreeningResultsList / UploadScreeningResultModal stubs)
vi.mock("@/app/features/screening/ScreeningSection", () => ({
  default: ({ applicantId }: { applicantId: string }) => (
    <div data-testid="stub-screening-section" data-applicant-id={applicantId} />
  ),
}));

import {
  useGetApplicantByIdQuery,
  useRevealApplicantSensitiveMutation,
} from "@mybookkeeper/api-client/store/applicantsApi";
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

function mockReveal(state: Record<string, unknown>) {
  const reveal = vi.fn();
  const reset = vi.fn();
  vi.mocked(useRevealApplicantSensitiveMutation).mockReturnValue([
    reveal,
    { isLoading: false, reset, ...state },
  ] as unknown as ReturnType<typeof useRevealApplicantSensitiveMutation>);
  return { reveal, reset };
}

const REVEALED = {
  dob: "1990-05-15",
  vehicle_make_model: "Toyota Camry",
  contact_email: "jane@example.com",
  contact_phone: "555-010-2030",
  references: [],
  screening_reports: [],
};

describe("ApplicantDetail sensitive data", () => {
  beforeEach(() => {
    vi.mocked(useGetApplicantByIdQuery).mockReturnValue(
      defaultQueryState as unknown as QueryReturn,
    );
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  it("asks the server only when the host presses show", async () => {
    const { reveal } = mockReveal({});
    renderDetail();
    expect(reveal).not.toHaveBeenCalled();
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("sensitive-data-toggle"));
    expect(reveal).toHaveBeenCalledWith("app-1");
  });

  it("shows what the server returned", () => {
    mockReveal({ data: REVEALED });
    renderDetail();
    expect(screen.getByTestId("sensitive-dob")).toHaveTextContent("1990-05-15");
    expect(screen.getByTestId("sensitive-vehicle")).toHaveTextContent("Toyota Camry");
    expect(screen.getByTestId("sensitive-contact-email")).toHaveTextContent("jane@example.com");
    expect(screen.getByTestId("sensitive-contact-phone")).toHaveTextContent("555-010-2030");
  });

  it("forgets the details when hidden", async () => {
    const { reset } = mockReveal({ data: REVEALED });
    renderDetail();
    await userEvent.click(screen.getByTestId("sensitive-data-toggle"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("forgets the details on moving to another applicant and back", async () => {
    vi.mocked(useRevealApplicantSensitiveMutation).mockImplementation((() => {
      const [data, setData] = useState<typeof REVEALED>();
      return [() => setData(REVEALED), { data, isLoading: false, reset: vi.fn() }];
    }) as unknown as typeof useRevealApplicantSensitiveMutation);
    const page = () => (
      <Provider store={store}>
        <MemoryRouter initialEntries={["/applicants/app-1"]}>
          <Routes>
            <Route path="/applicants/:applicantId" element={<ApplicantDetail />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    const { rerender } = render(page());
    await userEvent.click(screen.getByTestId("sensitive-data-toggle"));
    expect(screen.getByTestId("sensitive-dob")).toHaveTextContent("1990-05-15");

    const other = { ...defaultQueryState, data: { ...defaultQueryState.data, id: "app-2" } };
    vi.mocked(useGetApplicantByIdQuery).mockReturnValue(other as unknown as QueryReturn);
    rerender(page());
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();

    vi.mocked(useGetApplicantByIdQuery).mockReturnValue(defaultQueryState as unknown as QueryReturn);
    rerender(page());
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();
    expect(screen.queryByText("1990-05-15")).toBeNull();
  });

  it("explains a failed request", () => {
    mockReveal({ error: { status: 500 } });
    renderDetail();
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load those details.");
  });

  it("says so when the host has asked too often", () => {
    mockReveal({ error: { status: 429 } });
    renderDetail();
    expect(screen.getByRole("alert")).toHaveTextContent("Try again later.");
  });
});

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
