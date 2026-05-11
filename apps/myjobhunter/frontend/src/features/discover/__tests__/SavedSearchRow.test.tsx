/**
 * Tests for SavedSearchRow — name field rendering (PR 6).
 *
 * When name is non-empty the name should be the primary identifier;
 * source badge becomes secondary. When name is empty the badge is primary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
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
