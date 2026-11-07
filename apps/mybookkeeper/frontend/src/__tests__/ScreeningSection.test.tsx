import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const eligibilityMock = vi.fn();
const resultsMock = vi.fn();

vi.mock("@mybookkeeper/api-client/store/screeningApi", () => ({
  useGetScreeningEligibilityQuery: () => eligibilityMock(),
  useGetScreeningResultsQuery: () => resultsMock(),
  useGetScreeningProvidersQuery: () => ({ isLoading: false, isError: false, data: undefined }),
  useLazyGetScreeningRedirectQuery: () => [vi.fn(), {}],
  useUploadScreeningResultMutation: () => [vi.fn(), { isLoading: false }],
}));

const showErrorMock = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: (m: string) => showErrorMock(m),
  showSuccess: vi.fn(),
}));

import ScreeningSection from "@/app/features/screening/ScreeningSection";
import { queryStatus } from "@/test/rtk-query-status";

const PENDING_RESULT = {
  id: "r-pending",
  applicant_id: "app-1",
  provider: "keycheck",
  status: "pending",
  has_report: false,
  notes: null,
  requested_at: "2026-05-01T10:00:00Z",
  completed_at: null,
  uploaded_at: "2026-05-01T10:00:00Z",
  uploaded_by_user_id: "user-1",
  created_at: "2026-05-01T10:00:00Z",
};

const PASS_RESULT = {
  ...PENDING_RESULT,
  id: "r-pass",
  status: "pass",
  has_report: true,
};

function sectionElement(canWrite = true) {
  return (
    <Provider store={store}>
      <ScreeningSection applicantId="app-1" canWrite={canWrite} />
    </Provider>
  );
}

function renderSection(canWrite = true) {
  return render(sectionElement(canWrite));
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

  it("keeps a started screening reachable after the applicant stops being eligible", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: false, missing_fields: ["Email or phone"], has_pending: true },
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
    expect(screen.getByTestId("screening-pending-upload-button")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-eligibility-gate")).not.toBeInTheDocument();
  });

  it("shows a started screening when the eligibility check fails", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: undefined });
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

  it("lets a writer upload a report without a pending result", async () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: false },
    });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [], isFetching: false, refetch: vi.fn() });
    renderSection(true);
    await userEvent.click(screen.getByTestId("screening-upload-button"));
    expect(screen.getByTestId("upload-screening-modal")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Pending" })).toBeNull();
    expect(screen.getByRole("option", { name: "Passed" })).toBeInTheDocument();
  });

  it("offers no upload to a viewer", () => {
    eligibilityMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { eligible: true, missing_fields: [], has_pending: false },
    });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [], isFetching: false, refetch: vi.fn() });
    renderSection(false);
    expect(screen.queryByTestId("screening-upload-button")).toBeNull();
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
    eligibilityMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: undefined });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [] });
    renderSection();
    expect(screen.getByTestId("screening-eligibility-error")).toBeInTheDocument();
  });

  it("retries a failed eligibility check, and keeps the error while it runs", async () => {
    const refetch = vi.fn();
    eligibilityMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: undefined, refetch });
    resultsMock.mockReturnValue({ isLoading: false, isError: false, data: [] });
    const { rerender } = renderSection();
    await userEvent.click(screen.getByTestId("screening-eligibility-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);

    eligibilityMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: true }), data: undefined, refetch });
    rerender(sectionElement());
    expect(screen.getByTestId("screening-eligibility-error")).toBeInTheDocument();
    expect(screen.getByTestId("screening-eligibility-retry")).toHaveTextContent("Retrying...");
    expect(screen.getByTestId("screening-eligibility-retry")).toBeDisabled();
  });

  it("offers Retry when the history fails, instead of saying there are no reports", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: false, data: { eligible: true, missing_fields: [], has_pending: false } });
    resultsMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: undefined, refetch: vi.fn() });
    renderSection();
    expect(screen.getByText("I couldn't load the screening history.")).toBeInTheDocument();
    expect(screen.getByTestId("screening-list-retry")).toHaveTextContent("Retry");
    expect(screen.queryByTestId("screening-results-empty")).not.toBeInTheDocument();
  });

  it("keeps the history error, not 'No completed screening reports yet', while Retry refetches", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: false, data: { eligible: true, missing_fields: [], has_pending: false } });
    resultsMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: true }), data: undefined, refetch: vi.fn() });
    renderSection();
    expect(screen.getByText("I couldn't load the screening history.")).toBeInTheDocument();
    expect(screen.getByTestId("screening-list-retry")).toBeDisabled();
    expect(screen.queryByTestId("screening-results-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("screening-section-skeleton")).not.toBeInTheDocument();
  });
  it("keeps loaded reports visible under the retry line when a refresh fails", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: false, data: { eligible: true, missing_fields: [], has_pending: false } });
    resultsMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: [PASS_RESULT], refetch: vi.fn() });
    renderSection();
    expect(screen.getByText("I couldn't load the screening history.")).toBeInTheDocument();
    expect(screen.getByTestId("screening-result-card-r-pass")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-results-empty")).not.toBeInTheDocument();
  });

  it("shows the error, not the empty note, when an empty history fails to refresh", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: false, data: { eligible: true, missing_fields: [], has_pending: false } });
    resultsMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: [], refetch: vi.fn() });
    renderSection();
    expect(screen.getByText("I couldn't load the screening history.")).toBeInTheDocument();
    expect(screen.queryByTestId("screening-results-empty")).not.toBeInTheDocument();
  });

  it("shows a pending screening alongside a history error", () => {
    eligibilityMock.mockReturnValue({ isLoading: false, isError: false, data: { eligible: true, missing_fields: [], has_pending: true } });
    resultsMock.mockReturnValue({ isLoading: false, ...queryStatus({ failed: true, fetching: false }), data: [PENDING_RESULT], refetch: vi.fn() });
    renderSection();
    expect(screen.getByText("I couldn't load the screening history.")).toBeInTheDocument();
    expect(screen.getByTestId("screening-pending-panel")).toBeInTheDocument();
  });
});
