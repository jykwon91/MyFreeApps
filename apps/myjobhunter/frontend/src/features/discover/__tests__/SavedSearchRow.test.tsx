/**
 * Tests for SavedSearchRow — name field rendering (PR 6).
 *
 * When name is non-empty the name should be the primary identifier;
 * source badge becomes secondary. When name is empty the badge is primary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SavedSearchRow from "../SavedSearchRow";
import type { DiscoverySource } from "@/types/discovery/discovery-source";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@platform/ui", () => ({
  Badge: ({ label }: { label: string }) => (
    <span data-testid="badge">{label}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    "data-testid"?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LoadingButton: ({
    children,
    onClick,
    isLoading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isLoading?: boolean;
  }) => (
    <button onClick={onClick} disabled={isLoading}>
      {children}
    </button>
  ),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  timeAgo: () => "1 hour ago",
  extractErrorMessage: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="alert-icon" />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  RefreshCw: () => null,
  Trash2: () => null,
}));

vi.mock("@/store/discoverApi", () => ({
  useRefreshDiscoverySourceMutation: () => [vi.fn(), { isLoading: false }],
  useDeactivateDiscoverySourceMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateDiscoverySourceMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("../EditFrequencyPopover", () => ({
  default: () => <div data-testid="edit-frequency-popover" />,
}));

vi.mock("../EditSavedSearchDialog", () => ({
  default: ({
    open,
    onClose,
  }: {
    source: unknown;
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="edit-saved-search-dialog">
        <button data-testid="edit-dialog-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock("../saved-search-summary", () => ({
  summarizeSearchQuery: (_config: unknown, _source: string) =>
    "Software Engineer — Remote",
  getSourceLabel: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
  getSourceBadgeColor: () => "gray",
}));

vi.mock("../refresh-interval", () => ({
  refreshIntervalShortLabel: () => "Every day",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "src-1",
    source: "greenhouse",
    name: "",
    config: { board_token: "stripe" },
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SavedSearchRow — name rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders source badge as primary when name is empty", () => {
    render(<SavedSearchRow source={makeSource({ name: "" })} />);

    const badge = screen.getByTestId("badge");
    // Badge is the first child in the row header when name is absent
    expect(badge).toBeInTheDocument();
    // The source-kind label is in the badge
    expect(badge.textContent).toBe("Greenhouse");
    // When name is empty, the query text is the main identifier span
    expect(screen.getByText("Software Engineer — Remote")).toBeInTheDocument();
  });

  it("renders name as primary and badge as secondary when name is present", () => {
    render(
      <SavedSearchRow
        source={makeSource({ name: "Stripe engineering", source: "greenhouse" })}
      />,
    );

    // Name appears prominently
    expect(screen.getByText("Stripe engineering")).toBeInTheDocument();
    // Badge is still present but now secondary
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    expect(screen.getByTestId("badge").textContent).toBe("Greenhouse");
  });

  it("shows the query summary as subtitle when name is set", () => {
    render(
      <SavedSearchRow
        source={makeSource({
          name: "Stripe engineering",
          source: "jsearch",
          config: { query: "software engineer remote" },
        })}
      />,
    );

    // The summarized query text should appear as a subtitle
    expect(screen.getByText("Software Engineer — Remote")).toBeInTheDocument();
  });

  it("does not show query summary as subtitle when name is empty", () => {
    // When no name, the query IS the primary text so no separate subtitle is needed
    render(
      <SavedSearchRow
        source={makeSource({ name: "", source: "jsearch", config: { query: "x" } })}
      />,
    );

    const allQueryEls = screen.queryAllByText("Software Engineer — Remote");
    // It should appear exactly once (as the main span, not as a subtitle too)
    expect(allQueryEls.length).toBe(1);
  });
});

describe("SavedSearchRow — edit affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an edit button on the row", () => {
    render(<SavedSearchRow source={makeSource()} />);

    expect(screen.getByTestId("edit-source-btn")).toBeInTheDocument();
  });

  it("opens the EditSavedSearchDialog when edit button is clicked", async () => {
    render(<SavedSearchRow source={makeSource()} />);

    // Dialog should be closed initially.
    expect(screen.queryByTestId("edit-saved-search-dialog")).not.toBeInTheDocument();

    const editBtn = screen.getByTestId("edit-source-btn");
    fireEvent.click(editBtn);

    // Dialog should now be open.
    expect(screen.getByTestId("edit-saved-search-dialog")).toBeInTheDocument();
  });

  it("closes the EditSavedSearchDialog when dialog calls onClose", async () => {
    render(<SavedSearchRow source={makeSource()} />);

    const editBtn = screen.getByTestId("edit-source-btn");
    fireEvent.click(editBtn);

    expect(screen.getByTestId("edit-saved-search-dialog")).toBeInTheDocument();

    const closeBtn = screen.getByTestId("edit-dialog-close-btn");
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId("edit-saved-search-dialog")).not.toBeInTheDocument();
  });
});
