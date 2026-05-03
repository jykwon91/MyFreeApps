import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const eligibilityMock = vi.fn();
const resultsMock = vi.fn();

vi.mock("@/shared/store/screeningApi", () => ({
  useGetScreeningEligibilityQuery: () => eligibilityMock(),
  useGetScreeningResultsQuery: () => resultsMock(),
  useGetScreeningProvidersQuery: () => ({ isLoading: false, isError: false, data: undefined }),
  useLazyGetScreeningRedirectQuery: () => [vi.fn(), {}],
  useUploadScreeningResultMutation: () => [vi.fn(), { isLoading: false }],
}));

const showErrorMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (m: string) => showErrorMock(m),
  showSuccess: vi.fn(),
}));

import ScreeningSection from "@/app/features/screening/ScreeningSection";

const PENDING_RESULT = {
  id: "r-pending",
  applicant_id: "app-1",
  provider: "keycheck",
  status: "pending",
  report_storage_key: null,
  adverse_action_snippet: null,
  notes: null,
  requested_at: "2026-05-01T10:00:00Z",
  completed_at: null,
  uploaded_at: "2026-05-01T10:00:00Z",
  uploaded_by_user_id: "user-1",
  created_at: "2026-05-01T10:00:00Z",
  presigned_url: null,
};

const PASS_RESULT = {
  ...PENDING_RESULT,
  id: "r-pass",
  status: "pass",
  report_storage_key: "screening/app-1/r.pdf",
  presigned_url: "https://storage.example.com/signed",
};

function renderSection(canWrite = true) {
  return render(
    <Provider store={store}>
      <ScreeningSection applicantId="app-1" canWrite={canWrite} />
    </Provider>,
  );
}

describe("ScreeningSection", () => {
  beforeEach(() => {
    eligibilityMock.mockReset();
    resultsMock.mockReset();
    showErrorMock.mockReset();
  });

  it("shows skeleton while loading", () => {
    eligibilityMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    resultsMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    renderSection();
    expect(screen.getByTestId("screening-section-skeleton")).toBeInTheDocument();
  });

  it("shows the eligibility gate when applicant is not eligible", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: false, missing_fields: ["Legal name"], has_pending: false },
    });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [] });
    renderSection();
    expect(screen.getByTestId("screening-eligibility-gate")).toBeInTheDocument();
  });

  it("shows pending panel when eligible and has_pending is true", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: true },
    });
    resultsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [PENDING_RESULT],
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByTestId("screening-pending-panel")).toBeInTheDocument();
  });

  it("shows completed result cards when results exist", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: false },
    });
    resultsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [PASS_RESULT],
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByTestId("screening-results-list")).toBeInTheDocument();
    expect(screen.getByTestId("screening-result-card-r-pass")).toBeInTheDocument();
  });

  it("shows empty results message when eligible but no results", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: false },
    });
    resultsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByTestId("screening-results-empty")).toBeInTheDocument();
  });

  it("shows placeholder text for viewers with no results", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: false },
    });
    resultsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSection(false); // canWrite = false
    expect(screen.getByTestId("screening-no-results-viewer")).toBeInTheDocument();
  });

  it("shows eligibility error message when eligibility fetch fails", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [] });
    renderSection();
    expect(screen.getByTestId("screening-eligibility-error")).toBeInTheDocument();
  });
});
