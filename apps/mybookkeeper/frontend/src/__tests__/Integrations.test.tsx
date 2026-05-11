import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Integrations from "@/app/pages/Integrations";
import type { Integration } from "@/shared/types/integration/integration";
import type { SyncLog } from "@/shared/types/integration/sync-log";

const mockGmailIntegration: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: "2024-03-15T10:00:00Z",
  metadata: { gmail_label: "Receipts" },
};

const mockNeedsReauthIntegration: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: "2024-03-10T10:00:00Z",
  metadata: null,
  needs_reauth: true,
  last_reauth_error: "RefreshError: Token has been expired or revoked.",
};

const mockSyncLog: SyncLog = {
  id: 1,
  status: "success",
  records_added: 5,
  error: null,
  started_at: "2024-03-15T09:00:00Z",
  completed_at: "2024-03-15T09:05:00Z",
  cancelled_at: null,
  total_items: 10,
  emails_total: 10,
  emails_done: 10,
  emails_fetched: 5,
  gmail_matches_total: 10,
};

const mockRunningSyncLog: SyncLog = {
  ...mockSyncLog,
  id: 2,
  status: "running",
  completed_at: null,
};

vi.mock("@/shared/store/integrationsApi", () => ({
  useGetIntegrationsQuery: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
  useConnectGmailMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDisconnectGmailMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useSyncGmailMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCancelGmailSyncMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetSyncLogsQuery: vi.fn(() => ({ data: [] })),
  useGetEmailQueueQuery: vi.fn(() => ({ data: [] })),
  useExtractAllMutation: vi.fn(() => [vi.fn()]),
  useDismissQueueItemMutation: vi.fn(() => [vi.fn()]),
  useRetryQueueItemMutation: vi.fn(() => [vi.fn()]),
  useRetryAllFailedMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateGmailLabelMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

import {
  useGetIntegrationsQuery,
  useGetSyncLogsQuery,
  useGetEmailQueueQuery,
  useDisconnectGmailMutation,
} from "@/shared/store/integrationsApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("integrations-info-dismissed");
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    vi.mocked(useGetEmailQueueQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetEmailQueueQuery>);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.removeItem("integrations-info-dismissed");
  });

  it("renders the Integrations title", () => {
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Integrations")).toBeInTheDocument();
  });

  it("shows info banner when not dismissed", () => {
    renderWithProviders(<Integrations />);
    expect(screen.getAllByText(/Connect Gmail/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/automatically scan your inbox/)).toBeInTheDocument();
  });

  it("hides info banner when dismissed in localStorage", () => {
    localStorage.setItem("integrations-info-dismissed", "1");
    renderWithProviders(<Integrations />);
    expect(screen.queryByText(/automatically scan your inbox/)).not.toBeInTheDocument();
  });

  it("dismisses info banner when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/automatically scan your inbox/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/automatically scan your inbox/)).not.toBeInTheDocument();
    expect(localStorage.getItem("integrations-info-dismissed")).toBe("1");
  });

  it("renders Gmail section", () => {
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Gmail")).toBeInTheDocument();
  });

  it("shows Connect Gmail button when not connected", () => {
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Connect Gmail")).toBeInTheDocument();
  });

  it("shows description text when Gmail is not connected", () => {
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Automatically import documents from your inbox")).toBeInTheDocument();
  });

  it("shows loading skeleton when integrations are loading", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [],
      isLoading: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    const { container } = renderWithProviders(<Integrations />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows Connected status and Sync now button when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });

  it("shows label filter input when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Only sync emails with label")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Receipts")).toBeInTheDocument();
  });

  it("initializes label input from saved metadata when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    const input = screen.getByPlaceholderText("e.g. Receipts");
    expect(input).toHaveValue("Receipts");
  });

  it("shows currently filtering by label text when label is set", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/Currently filtering by: "Receipts"/)).toBeInTheDocument();
  });

  it("shows sync all emails hint when label is not set", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [{ ...mockGmailIntegration, metadata: null }],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Leave empty to sync all emails")).toBeInTheDocument();
  });

  it("shows sync confirmation prompt when Sync now is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    await user.click(screen.getByText("Sync now"));
    expect(screen.getByText("Start email sync?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("dismisses sync confirmation when No is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    await user.click(screen.getByText("Sync now"));
    expect(screen.getByText("Start email sync?")).toBeInTheDocument();
    await user.click(screen.getByText("No"));
    expect(screen.queryByText("Start email sync?")).not.toBeInTheDocument();
  });

  it("shows Sync Sessions section when Gmail is connected and sync logs exist", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [mockSyncLog],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Sync Sessions")).toBeInTheDocument();
  });

  it("does not show Sync Sessions when no sync logs exist", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.queryByText("Sync Sessions")).not.toBeInTheDocument();
  });

  it("shows Cancel button when a sync is running", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [mockRunningSyncLog],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows Extract All button when fetched items are in the queue", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [mockSyncLog],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    vi.mocked(useGetEmailQueueQuery).mockReturnValue({
      data: [
        {
          id: "q1",
          sync_log_id: 1,
          attachment_filename: "invoice.pdf",
          email_subject: "Invoice #123",
          status: "fetched",
          error: null,
          created_at: "2024-03-15T09:01:00Z",
        },
      ],
    } as unknown as ReturnType<typeof useGetEmailQueueQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/Extract All/)).toBeInTheDocument();
  });

  it("shows Retry Failed button when failed items are in the queue", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [mockSyncLog],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    vi.mocked(useGetEmailQueueQuery).mockReturnValue({
      data: [
        {
          id: "q2",
          sync_log_id: 1,
          attachment_filename: "receipt.pdf",
          email_subject: "Receipt",
          status: "failed",
          error: "Extraction timed out",
          created_at: "2024-03-15T09:02:00Z",
        },
      ],
    } as unknown as ReturnType<typeof useGetEmailQueueQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/Retry Failed/)).toBeInTheDocument();
  });

  it("does not show Sync Sessions when Gmail is not connected", () => {
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [mockSyncLog],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.queryByText("Sync Sessions")).not.toBeInTheDocument();
  });

  it("label filter Save button is disabled when value matches saved label", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    const saveBtn = screen.getByText("Save");
    expect(saveBtn).toBeDisabled();
  });

  it("label filter Save button is enabled after changing the input", async () => {
    const user = userEvent.setup();
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    const input = screen.getByPlaceholderText("e.g. Receipts");
    await user.clear(input);
    await user.type(input, "Invoices");
    expect(screen.getByText("Save")).not.toBeDisabled();
  });

  it("shows Disconnect button when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("shows disconnect confirmation prompt when Disconnect is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText("Disconnect Gmail?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("dismisses disconnect confirmation when No is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByText("No"));
    expect(screen.queryByText("Disconnect Gmail?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("calls the disconnect mutation and dismisses the prompt when Yes is clicked", async () => {
    const user = userEvent.setup();
    const unwrapMock = vi.fn().mockResolvedValue(undefined);
    const disconnectMock = vi.fn(() => ({ unwrap: unwrapMock }));

    vi.mocked(useDisconnectGmailMutation).mockReturnValue([
      disconnectMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useDisconnectGmailMutation>);

    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);

    renderWithProviders(<Integrations />);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByText("Yes"));

    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(unwrapMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Disconnect Gmail?")).not.toBeInTheDocument();
  });

  it("does not crash when the disconnect mutation rejects", async () => {
    const user = userEvent.setup();
    const unwrapMock = vi.fn().mockRejectedValue({ data: { detail: "network down" } });
    const disconnectMock = vi.fn(() => ({ unwrap: unwrapMock }));

    vi.mocked(useDisconnectGmailMutation).mockReturnValue([
      disconnectMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useDisconnectGmailMutation>);

    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);

    renderWithProviders(<Integrations />);
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await user.click(screen.getByText("Yes"));

    await Promise.resolve();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Gmail")).toBeInTheDocument();
  });
});

describe("Integrations — needs_reauth state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("integrations-info-dismissed");
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    vi.mocked(useGetEmailQueueQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetEmailQueueQuery>);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.removeItem("integrations-info-dismissed");
  });

  it("shows 'Reconnection required' status when needs_reauth is true", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauthIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByTestId("gmail-needs-reauth-status")).toBeInTheDocument();
    expect(screen.getByText(/Reconnection required/)).toBeInTheDocument();
  });

  it("shows Reconnect Gmail button instead of Sync/Disconnect when needs_reauth", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauthIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByTestId("gmail-reconnect-button")).toBeInTheDocument();
    expect(screen.queryByText("Sync now")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("reconnect button triggers the connectGmail mutation", async () => {
    const user = userEvent.setup();
    const unwrapMock = vi.fn().mockResolvedValue({ auth_url: "https://accounts.google.com/o/oauth2/auth" });
    const connectMock = vi.fn(() => ({ unwrap: unwrapMock }));

    const { useConnectGmailMutation } = await import("@/shared/store/integrationsApi");
    vi.mocked(useConnectGmailMutation).mockReturnValue([
      connectMock,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useConnectGmailMutation>);

    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauthIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);

    renderWithProviders(<Integrations />);
    await user.click(screen.getByTestId("gmail-reconnect-button"));
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});

describe("Integrations — viewer role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("integrations-info-dismissed");
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    vi.mocked(useGetSyncLogsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetSyncLogsQuery>);
    vi.mocked(useGetEmailQueueQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useGetEmailQueueQuery>);
    vi.mocked(useCanWrite).mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.removeItem("integrations-info-dismissed");
  });

  it("hides Connect Gmail button for viewer", () => {
    renderWithProviders(<Integrations />);
    expect(screen.queryByText("Connect Gmail")).not.toBeInTheDocument();
  });

  it("hides Sync now button for viewer when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.queryByText("Sync now")).not.toBeInTheDocument();
  });

  it("hides Disconnect button for viewer when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("hides label save input for viewer when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.queryByPlaceholderText("e.g. Receipts")).not.toBeInTheDocument();
  });

  it("still shows label filter description for viewer when Gmail is connected", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockGmailIntegration],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderWithProviders(<Integrations />);
    expect(screen.getByText(/Currently filtering by: "Receipts"/)).toBeInTheDocument();
  });
});
