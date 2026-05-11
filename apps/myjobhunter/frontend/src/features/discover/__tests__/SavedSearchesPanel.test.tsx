/**
 * Tests for SavedSearchesPanel — error state and "Fetch failed" badge
 * when consecutive_failures > 0.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SavedSearchesPanel from "../SavedSearchesPanel";
import type { DiscoverySource } from "@/types/discovery/discovery-source";

vi.mock("@/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: vi.fn(),
  useRefreshDiscoverySourceMutation: vi.fn(),
  useDeactivateDiscoverySourceMutation: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="alert-icon" />,
  RefreshCw: () => null,
  Trash2: () => null,
}));

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
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  LoadingButton: ({
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
  showError: vi.fn(),
  showSuccess: vi.fn(),
  timeAgo: () => "2 hours ago",
  extractErrorMessage: vi.fn(),
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("../SavedSearchesSkeleton", () => ({
  default: () => <div data-testid="sources-skeleton" />,
}));

vi.mock("../saved-search-summary", () => ({
  summarizeSearchQuery: () => "Software Engineer — Remote",
}));

import {
  useListDiscoverySourcesQuery,
  useRefreshDiscoverySourceMutation,
  useDeactivateDiscoverySourceMutation,
} from "@/store/discoverApi";

const mockListSources = vi.mocked(useListDiscoverySourcesQuery);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubMutation = [vi.fn(), { isLoading: false }] as any;

function makeSource(
  overrides: Partial<DiscoverySource> = {},
): DiscoverySource {
  return {
    id: "src-1",
    source: "jsearch",
    config: {},
    is_active: true,
    fetch_interval_minutes: 60,
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

describe("SavedSearchesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRefreshDiscoverySourceMutation).mockReturnValue(stubMutation);
    vi.mocked(useDeactivateDiscoverySourceMutation).mockReturnValue(
      stubMutation,
    );
  });

  it("shows skeleton while loading", () => {
    mockListSources.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    render(<SavedSearchesPanel />);

    expect(screen.getByTestId("sources-skeleton")).toBeInTheDocument();
  });

  it("shows error message when sources query fails", () => {
    mockListSources.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    render(<SavedSearchesPanel />);

    expect(
      screen.getByText(/Couldn't load saved searches/i),
    ).toBeInTheDocument();
  });

  it("renders nothing when sources list is empty", () => {
    mockListSources.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    const { container } = render(<SavedSearchesPanel />);

    expect(container.firstChild).toBeNull();
  });

  it("renders source rows when sources exist", () => {
    mockListSources.mockReturnValue({
      data: [makeSource()],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    render(<SavedSearchesPanel />);

    expect(screen.getByText("Software Engineer — Remote")).toBeInTheDocument();
  });

  it("shows 'Fetch failed' badge when consecutive_failures > 0", () => {
    mockListSources.mockReturnValue({
      data: [makeSource({ consecutive_failures: 3 })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    render(<SavedSearchesPanel />);

    expect(screen.getByText("Fetch failed")).toBeInTheDocument();
    expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
  });

  it("does NOT show 'Fetch failed' badge when consecutive_failures is 0", () => {
    mockListSources.mockReturnValue({
      data: [makeSource({ consecutive_failures: 0 })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);

    render(<SavedSearchesPanel />);

    expect(screen.queryByText("Fetch failed")).toBeNull();
  });
});
