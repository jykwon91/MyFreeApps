/**
 * SavedSearchRow's Refresh and Remove actions: what each says on success and failure, and that
 * the edit dialog only exists while it is open (so each opening starts from the saved row).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SavedSearchRow from "../SavedSearchRow";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

const { showError, showSuccess, refresh, deactivate, dialogRenders } = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  refresh: vi.fn(),
  deactivate: vi.fn(),
  dialogRenders: vi.fn(),
}));

vi.mock("@platform/ui", () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ children, onClick, "aria-label": ariaLabel }: { children: React.ReactNode; onClick?: () => void; "aria-label"?: string }) => (
    <button onClick={onClick} aria-label={ariaLabel}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LoadingButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  showError,
  showSuccess,
}));

vi.mock("lucide-react", () => ({ AlertTriangle: () => null, Pencil: () => null, RefreshCw: () => null, Trash2: () => null }));

vi.mock("@myjobhunter/api-client/store/discoverApi", () => ({
  useRefreshDiscoverySourceMutation: () => [refresh, { isLoading: false }],
  useDeactivateDiscoverySourceMutation: () => [deactivate, { isLoading: false }],
}));

vi.mock("../EditFrequencyPopover", () => ({ default: () => null }));

vi.mock("../EditSavedSearchDialog", () => ({
  default: ({ onClose }: { onClose: () => void }) => {
    dialogRenders();
    return <button onClick={onClose}>Close edit</button>;
  },
}));

const source: DiscoverySource = {
  id: "src-1",
  source: "jsearch",
  name: "Backend",
  config: { roles: ["Backend Engineer"] },
  is_active: true,
  fetch_interval_minutes: 1440,
  last_fetched_at: null,
  last_success_at: null,
  last_error_at: null,
  last_error_message: null,
  consecutive_failures: 0,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

function answer(value: unknown) {
  return { unwrap: () => Promise.resolve(value) };
}

function fail(error: unknown) {
  return { unwrap: () => Promise.reject(error) };
}

const onRefreshed = vi.fn();

const fetched = { fetch_id: "f", status: "success", fetched_count: 4, new_count: 2, updated_count: 0, duration_ms: 1, error_message: null };

describe("SavedSearchRow — refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says what it fetched", async () => {
    refresh.mockReturnValue(answer(fetched));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Fetched 4 postings (2 new)"));
    // A refresh that added postings opens the inbox's scoring window for this saved search.
    expect(onRefreshed).toHaveBeenCalledExactlyOnceWith(source.id);
  });

  it("doesn't open the scoring window when the refresh found nothing new", async () => {
    refresh.mockReturnValue(answer({ ...fetched, new_count: 0 }));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Fetched 4 postings (0 new)"));
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("says a fetch failed even when it gave no reason", async () => {
    refresh.mockReturnValue(answer({ ...fetched, status: "error", new_count: 0 }));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Refresh failed"));
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("turns the refresh limit into a friendly retry", async () => {
    refresh.mockReturnValue(fail({ status: 429, data: { detail: "Too many attempts" } }));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("You've refreshed a lot — try again in a few minutes"));
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("keeps JSearch's own quota message", async () => {
    refresh.mockReturnValue(fail({ status: 429, data: { detail: "JSearch quota reached" } }));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("JSearch quota reached"));
  });
});

describe("SavedSearchRow — remove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms the removal", async () => {
    deactivate.mockReturnValue(answer(undefined));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByLabelText("Remove saved search"));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Saved search removed"));
  });

  it("falls back to its own message when the server gives no reason", async () => {
    deactivate.mockReturnValue(fail({ status: "FETCH_ERROR", data: undefined }));
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    fireEvent.click(screen.getByLabelText("Remove saved search"));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't remove saved search"));
  });
});

describe("SavedSearchRow — edit dialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exists only while open, so each opening starts fresh", () => {
    render(<SavedSearchRow onRefreshed={onRefreshed} source={source} />);
    expect(dialogRenders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Edit saved search"));
    expect(dialogRenders).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close edit"));
    expect(screen.queryByText("Close edit")).toBeNull();
  });
});
