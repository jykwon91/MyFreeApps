import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";

const useGetScreeningResultsQueryMock = vi.fn();

vi.mock("@/shared/store/screeningApi", () => ({
  useGetScreeningResultsQuery: (...args: unknown[]) => useGetScreeningResultsQueryMock(...args),
}));

import ScreeningResultsList from "@/app/features/screening/ScreeningResultsList";

const baseRow: ScreeningResult = {
  id: "result-1",
  applicant_id: "app-1",
  provider: "keycheck",
  status: "pass",
  report_storage_key: "screening/app-1/r1.pdf",
  adverse_action_snippet: null,
  notes: null,
  requested_at: "2026-04-29T10:00:00Z",
  completed_at: "2026-04-29T10:00:00Z",
  uploaded_at: "2026-04-29T10:00:00Z",
  uploaded_by_user_id: "user-1",
  created_at: "2026-04-29T10:00:00Z",
  presigned_url: "https://signed.example/r1",
};

function renderList() {
  return render(
    <Provider store={store}>
      <ScreeningResultsList applicantId="app-1" />
    </Provider>,
  );
}

describe("ScreeningResultsList", () => {
  beforeEach(() => {
    useGetScreeningResultsQueryMock.mockReset();
  });

  it("renders the loading skeleton while fetching", () => {
    useGetScreeningResultsQueryMock.mockReturnValue({
      isLoading: true,
      isError: false,
      isFetching: true,
    });
    renderList();
    expect(screen.getByTestId("screening-results-skeleton")).toBeInTheDocument();
  });

  it("renders the empty state when there are no results", () => {
    useGetScreeningResultsQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    renderList();
    expect(screen.getByTestId("screening-results-empty")).toBeInTheDocument();
  });

  it("renders rows in the order returned by the server", () => {
    const newer: ScreeningResult = {
      ...baseRow,
      id: "result-newer",
      uploaded_at: "2026-04-29T10:00:00Z",
    };
    const older: ScreeningResult = {
      ...baseRow,
      id: "result-older",
      uploaded_at: "2026-04-28T10:00:00Z",
    };
    useGetScreeningResultsQueryMock.mockReturnValue({
      data: [newer, older],
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    renderList();
    const list = screen.getByTestId("screening-results-list");
    const items = list.querySelectorAll("[data-testid^='screening-result-']");
    expect(items.length).toBe(2);
    // First row in DOM order should be the newest one — backend sorts by
    // uploaded_at desc, list preserves order.
    expect(items[0].getAttribute("data-testid")).toBe("screening-result-result-newer");
  });

  it("renders the retry control on error", () => {
    useGetScreeningResultsQueryMock.mockReturnValue({
      isError: true,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderList();
    expect(screen.getByTestId("screening-list-retry")).toBeInTheDocument();
  });
});
