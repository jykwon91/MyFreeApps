import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailQueueSection from "@/app/features/integrations/EmailQueueSection";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";

function makeMutationFn() {
  const fn = vi.fn(() => ({ unwrap: () => Promise.resolve({ count: 0, id: "", status: "" }) }));
  return fn;
}

const mockExtractAll = makeMutationFn();
const mockDismissItem = makeMutationFn();
const mockRetryItem = makeMutationFn();
const mockRetryAllFailed = makeMutationFn();

vi.mock("@/shared/store/integrationsApi", () => ({
  useGetEmailQueueQuery: vi.fn(),
  useExtractAllMutation: vi.fn(),
  useDismissQueueItemMutation: vi.fn(),
  useRetryQueueItemMutation: vi.fn(),
  useRetryAllFailedMutation: vi.fn(),
}));

import {
  useGetEmailQueueQuery,
  useExtractAllMutation,
  useDismissQueueItemMutation,
  useRetryQueueItemMutation,
  useRetryAllFailedMutation,
} from "@/shared/store/integrationsApi";

function makeItem(overrides: Partial<EmailQueueItem> = {}): EmailQueueItem {
  return {
    id: crypto.randomUUID(),
    sync_log_id: 1,
    attachment_filename: null,
    email_subject: null,
    status: "fetched",
    error: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function setupMocks(
  queue: EmailQueueItem[],
  opts: { isExtracting?: boolean; isRetrying?: boolean } = {},
): void {
  vi.mocked(useGetEmailQueueQuery).mockReturnValue({
    data: queue,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetEmailQueueQuery>);

  vi.mocked(useExtractAllMutation).mockReturnValue([
    mockExtractAll,
    { isLoading: opts.isExtracting ?? false },
  ] as unknown as ReturnType<typeof useExtractAllMutation>);

  vi.mocked(useDismissQueueItemMutation).mockReturnValue([
    mockDismissItem,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useDismissQueueItemMutation>);

  vi.mocked(useRetryQueueItemMutation).mockReturnValue([
    mockRetryItem,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useRetryQueueItemMutation>);

  vi.mocked(useRetryAllFailedMutation).mockReturnValue([
    mockRetryAllFailed,
    { isLoading: opts.isRetrying ?? false },
  ] as unknown as ReturnType<typeof useRetryAllFailedMutation>);
}

describe("EmailQueueSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when queue is empty", () => {
    setupMocks([]);
    const { container } = render(<EmailQueueSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows correct fetched count", () => {
    setupMocks([makeItem({ status: "fetched" }), makeItem({ status: "fetched" })]);
    render(<EmailQueueSection />);
    expect(screen.getByText(/2 fetched/)).toBeInTheDocument();
  });

  it("shows correct extracting count", () => {
    setupMocks([makeItem({ status: "extracting" })]);
    render(<EmailQueueSection />);
    expect(screen.getByText(/1 extracting/)).toBeInTheDocument();
  });

  it("shows correct failed count", () => {
    setupMocks([
      makeItem({ status: "failed", error: "timeout" }),
      makeItem({ status: "failed", error: "bad pdf" }),
    ]);
    render(<EmailQueueSection />);
    expect(screen.getByText(/2 failed/)).toBeInTheDocument();
  });

  it("shows 'All items processed' when only done items remain", () => {
    setupMocks([makeItem({ status: "done" })]);
    render(<EmailQueueSection />);
    expect(screen.getByText(/all items processed/i)).toBeInTheDocument();
  });

  it("shows Extract All button with fetched count", () => {
    setupMocks([makeItem({ status: "fetched" }), makeItem({ status: "fetched" })]);
    render(<EmailQueueSection />);
    expect(screen.getByRole("button", { name: /extract all \(2\)/i })).toBeInTheDocument();
  });

  it("hides Extract All button when no fetched items", () => {
    setupMocks([makeItem({ status: "done" })]);
    render(<EmailQueueSection />);
    expect(screen.queryByRole("button", { name: /extract all/i })).not.toBeInTheDocument();
  });

  it("Extract All calls extractAll mutation", async () => {
    const user = userEvent.setup();
    setupMocks([makeItem({ status: "fetched" })]);
    render(<EmailQueueSection />);
    await user.click(screen.getByRole("button", { name: /extract all/i }));
    expect(mockExtractAll).toHaveBeenCalledOnce();
  });

  it("shows extracting indicator when items are extracting", () => {
    setupMocks([makeItem({ status: "extracting" })]);
    render(<EmailQueueSection />);
    expect(screen.getByRole("button", { name: /extracting \(1\)\.\.\./i })).toBeDisabled();
  });

  it("shows Retry Failed button with count", () => {
    setupMocks([makeItem({ status: "failed", error: "err" })]);
    render(<EmailQueueSection />);
    expect(screen.getByRole("button", { name: /retry failed \(1\)/i })).toBeInTheDocument();
  });

  it("hides Retry Failed button when no failures", () => {
    setupMocks([makeItem({ status: "fetched" })]);
    render(<EmailQueueSection />);
    expect(screen.queryByRole("button", { name: /retry failed/i })).not.toBeInTheDocument();
  });

  it("Retry Failed calls retryAllFailed mutation", async () => {
    const user = userEvent.setup();
    setupMocks([makeItem({ status: "failed", error: "err" })]);
    render(<EmailQueueSection />);
    await user.click(screen.getByRole("button", { name: /retry failed/i }));
    expect(mockRetryAllFailed).toHaveBeenCalledOnce();
  });

  it("per-item retry button appears only on failed items", () => {
    setupMocks([
      makeItem({ status: "fetched" }),
      makeItem({ status: "failed", error: "err" }),
      makeItem({ status: "done" }),
    ]);
    render(<EmailQueueSection />);
    expect(screen.getAllByTitle("Retry")).toHaveLength(1);
  });

  it("per-item retry calls retryItem with correct id", async () => {
    const user = userEvent.setup();
    const failedId = "failed-item-id";
    setupMocks([makeItem({ id: failedId, status: "failed", error: "timeout" })]);
    render(<EmailQueueSection />);
    await user.click(screen.getByTitle("Retry"));
    expect(mockRetryItem).toHaveBeenCalledWith(failedId);
  });

  it("failed items show error message", () => {
    const errorMsg = "Claude API rate limit exceeded";
    setupMocks([makeItem({ status: "failed", error: errorMsg })]);
    render(<EmailQueueSection />);
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it("non-failed items do not show error text", () => {
    setupMocks([makeItem({ status: "done", error: "stale error" })]);
    render(<EmailQueueSection />);
    expect(screen.queryByText("stale error")).not.toBeInTheDocument();
  });

  it("renders attachment filename when present", () => {
    setupMocks([makeItem({ attachment_filename: "invoice_jan.pdf" })]);
    render(<EmailQueueSection />);
    expect(screen.getByText("invoice_jan.pdf")).toBeInTheDocument();
  });

  it("renders 'Email body' when attachment filename is null", () => {
    setupMocks([makeItem({ attachment_filename: null })]);
    render(<EmailQueueSection />);
    expect(screen.getByText("Email body")).toBeInTheDocument();
  });

  it("renders email subject when present", () => {
    setupMocks([makeItem({ email_subject: "Invoice from Acme Corp" })]);
    render(<EmailQueueSection />);
    expect(screen.getByText("Invoice from Acme Corp")).toBeInTheDocument();
  });

  it("renders correct status badge labels", () => {
    const cases: Array<{ status: EmailQueueItem["status"]; label: string }> = [
      { status: "pending", label: "Pending" },
      { status: "fetched", label: "Fetched" },
      { status: "extracting", label: "Extracting" },
      { status: "done", label: "Done" },
      { status: "failed", label: "Failed" },
    ];

    for (const { status, label } of cases) {
      setupMocks([makeItem({ status, error: status === "failed" ? "err" : null })]);
      const { unmount } = render(<EmailQueueSection />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("groups items by sync session", () => {
    setupMocks([
      makeItem({ sync_log_id: 2, attachment_filename: "invoice_a.pdf" }),
      makeItem({ sync_log_id: 2, attachment_filename: "invoice_b.pdf" }),
      makeItem({ sync_log_id: 1, attachment_filename: "receipt.pdf" }),
    ]);
    render(<EmailQueueSection />);
    const sessionHeaders = screen.getAllByText(/sync session/i);
    expect(sessionHeaders).toHaveLength(2);
    const itemCounts = screen.getAllByText(/item/);
    expect(itemCounts[0]).toHaveTextContent("2 items");
    expect(itemCounts[1]).toHaveTextContent("1 item");
  });

  it("shows most recent session first", () => {
    setupMocks([
      makeItem({ sync_log_id: 1, attachment_filename: "old.pdf" }),
      makeItem({ sync_log_id: 3, attachment_filename: "new.pdf" }),
    ]);
    render(<EmailQueueSection />);
    const filenames = screen.getAllByText(/(old|new)\.pdf/);
    expect(filenames[0]).toHaveTextContent("new.pdf");
    expect(filenames[1]).toHaveTextContent("old.pdf");
  });
});
