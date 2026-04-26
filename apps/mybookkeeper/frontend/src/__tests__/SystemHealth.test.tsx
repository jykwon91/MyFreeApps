import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import SystemHealth from "@/admin/pages/SystemHealth";
import type { HealthSummary, SystemEvent } from "@/shared/types/health/health-summary";

const mockStats = {
  documents_processing: 2,
  documents_failed: 3,
  documents_retry_pending: 1,
  extractions_today: 45,
  corrections_today: 5,
  api_tokens_today: 250000,
};

const mockSummary: HealthSummary = {
  status: "healthy",
  active_problems: [],
  stats: mockStats,
  recent_events: [],
};

const mockEvents: SystemEvent[] = [
  {
    id: "evt-1",
    organization_id: null,
    event_type: "extraction_failed",
    severity: "error",
    message: "Document extraction failed for invoice.pdf",
    event_data: null,
    resolved: false,
    created_at: "2024-03-15T10:00:00Z",
  },
  {
    id: "evt-2",
    organization_id: "org-1",
    event_type: "sync_complete",
    severity: "info",
    message: "Gmail sync completed successfully",
    event_data: null,
    resolved: true,
    created_at: "2024-03-15T09:00:00Z",
  },
];

vi.mock("@/shared/store/healthApi", () => ({
  useGetHealthSummaryQuery: vi.fn(() => ({ data: mockSummary, isLoading: false })),
  useGetHealthEventsQuery: vi.fn(() => ({ data: mockEvents, isLoading: false })),
  useResolveEventMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRetryFailedMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

import {
  useGetHealthSummaryQuery,
  useGetHealthEventsQuery,
  useRetryFailedMutation,
} from "@/shared/store/healthApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("SystemHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: mockSummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    vi.mocked(useGetHealthEventsQuery).mockReturnValue({
      data: mockEvents,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthEventsQuery>);
    vi.mocked(useRetryFailedMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false } as unknown as ReturnType<typeof useRetryFailedMutation>[1],
    ]);
  });

  it("renders the System Health title", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("System Health")).toBeInTheDocument();
  });

  it("renders the monitoring subtitle", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Monitor document processing and extraction status")).toBeInTheDocument();
  });

  it("shows Healthy status indicator when system is healthy", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("shows Degraded status indicator when system is degraded", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: { ...mockSummary, status: "degraded" },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows Unhealthy status indicator when system is unhealthy", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: { ...mockSummary, status: "unhealthy" },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
  });

  it("renders stats grid cards", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Documents Processing")).toBeInTheDocument();
    expect(screen.getByText("Documents Failed")).toBeInTheDocument();
    expect(screen.getByText("Retry Pending")).toBeInTheDocument();
    expect(screen.getByText("Extractions Today")).toBeInTheDocument();
    expect(screen.getByText("Corrections Today")).toBeInTheDocument();
    expect(screen.getByText("API Tokens Today")).toBeInTheDocument();
  });

  it("renders stats grid values from summary data", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("250,000")).toBeInTheDocument();
  });

  it("renders Recent Activity section with event messages", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Document extraction failed for invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText("Gmail sync completed successfully")).toBeInTheDocument();
  });

  it("renders event type and severity badges in the events table", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getAllByText("extraction failed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sync complete").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("shows Resolved text for already-resolved events", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("shows Resolve button for unresolved non-auto-resolve events", () => {
    const eventsWithManualResolve: SystemEvent[] = [
      {
        id: "evt-3",
        organization_id: null,
        event_type: "quota_exceeded",
        severity: "warning",
        message: "Daily quota exceeded",
        event_data: null,
        resolved: false,
        created_at: "2024-03-15T11:00:00Z",
      },
    ];
    vi.mocked(useGetHealthEventsQuery).mockReturnValue({
      data: eventsWithManualResolve,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthEventsQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Resolve")).toBeInTheDocument();
  });

  it("shows Auto-resolves label for extraction_failed event type", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Auto-resolves")).toBeInTheDocument();
  });

  it("renders severity filter dropdown with all options", () => {
    renderWithProviders(<SystemHealth />);
    const severitySelect = screen.getByRole("combobox", { name: "Filter by severity" });
    expect(severitySelect).toBeInTheDocument();
    expect(severitySelect).toHaveValue("all");
  });

  it("renders event type filter dropdown", () => {
    renderWithProviders(<SystemHealth />);
    const typeSelect = screen.getByRole("combobox", { name: "Filter by event type" });
    expect(typeSelect).toBeInTheDocument();
  });

  it("changes severity filter when a different option is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemHealth />);
    const severitySelect = screen.getByRole("combobox", { name: "Filter by severity" });
    await user.selectOptions(severitySelect, "error");
    expect(severitySelect).toHaveValue("error");
  });

  it("shows empty events state when no events match filters", () => {
    vi.mocked(useGetHealthEventsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthEventsQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("No events match your filters")).toBeInTheDocument();
  });

  it("renders Active Problems section when problems exist", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: {
        ...mockSummary,
        active_problems: [
          { type: "failed_docs", count: 3, severity: "error", message: "3 documents are stuck in failed state" },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Active Problems")).toBeInTheDocument();
    expect(screen.getByText("3 documents are stuck in failed state")).toBeInTheDocument();
  });

  it("does not render Active Problems section when no problems exist", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.queryByText("Active Problems")).not.toBeInTheDocument();
  });

  it("renders Retry Failed Documents button", () => {
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Retry Failed Documents")).toBeInTheDocument();
  });

  it("Retry Failed Documents button is disabled when no failed documents", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: { ...mockSummary, stats: { ...mockStats, documents_failed: 0 } },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    renderWithProviders(<SystemHealth />);
    expect(screen.getByText("Retry Failed Documents").closest("button")).toBeDisabled();
  });

  it("shows skeleton when summary is loading", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    const { container } = renderWithProviders(<SystemHealth />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows skeleton when summary is undefined even if not loading", () => {
    vi.mocked(useGetHealthSummaryQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetHealthSummaryQuery>);
    const { container } = renderWithProviders(<SystemHealth />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
