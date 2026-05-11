/**
 * Tests for Discover page — Saved tab, error branches, and tab navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Discover from "@/pages/Discover";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

vi.mock("@/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: vi.fn(),
  useListDiscoveredJobsQuery: vi.fn(),
  useCreateDiscoverySourceMutation: vi.fn(),
  useDeactivateDiscoverySourceMutation: vi.fn(),
  useRefreshDiscoverySourceMutation: vi.fn(),
  useDismissDiscoveredJobMutation: vi.fn(),
  useSaveDiscoveredJobMutation: vi.fn(),
  usePromoteDiscoveredJobMutation: vi.fn(),
}));

// NewSavedSearchDialog and SavedSearchesPanel use RTK mutations + profileApi
// not worth wiring in page-level unit tests — behaviour tested in their own files.
vi.mock("@/features/discover/NewSavedSearchDialog", () => ({
  default: ({ open }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="new-search-dialog" /> : null,
}));

vi.mock("@/features/discover/SavedSearchesPanel", () => ({
  default: () => <div data-testid="saved-searches-panel" />,
}));

// Suppress radix-dialog portal errors in jsdom.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  };
});

import {
  useListDiscoverySourcesQuery,
  useListDiscoveredJobsQuery,
  useCreateDiscoverySourceMutation,
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
  useDismissDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
} from "@/store/discoverApi";

const mockListSources = vi.mocked(useListDiscoverySourcesQuery);
const mockListJobs = vi.mocked(useListDiscoveredJobsQuery);

// Stub mutations — none of the tests exercise them; they just need to not crash.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubMutation = [vi.fn(), { isLoading: false }] as any;

function stubAllMutations() {
  vi.mocked(useCreateDiscoverySourceMutation).mockReturnValue(stubMutation);
  vi.mocked(useDeactivateDiscoverySourceMutation).mockReturnValue(stubMutation);
  vi.mocked(useRefreshDiscoverySourceMutation).mockReturnValue(stubMutation);
  vi.mocked(useDismissDiscoveredJobMutation).mockReturnValue(stubMutation);
  vi.mocked(useSaveDiscoveredJobMutation).mockReturnValue(stubMutation);
  vi.mocked(usePromoteDiscoveredJobMutation).mockReturnValue(stubMutation);
}

function renderDiscover(initialUrl = "/discover") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Minimal source fixture
const aSource = {
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
};

// Minimal discovered-job fixture
const aJob = {
  id: "job-1",
  source: "jsearch",
  source_publisher: null,
  source_url: null,
  title: "Senior Backend Engineer",
  company_name: "Acme Corp",
  location: "Remote",
  remote_type: "remote",
  description: null,
  posted_at: null,
  discovered_at: "2026-05-08T10:00:00Z",
  salary_min: null,
  salary_max: null,
  salary_currency: "USD",
  salary_period: null,
  score: null,
  score_reason: null,
  scored_at: null,
  dismissed_at: null,
  dismissed_reason: null,
  saved_at: "2026-05-09T10:00:00Z",
  promoted_application_id: null,
  verdict: null,
};

describe("Discover page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAllMutations();
  });

  // -------------------------------------------------------------------------
  // Tab rendering
  // -------------------------------------------------------------------------

  describe("tab bar", () => {
    it("renders Inbox and Saved tabs", () => {
      mockListSources.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      expect(screen.getByRole("tab", { name: "Inbox" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Saved" })).toBeInTheDocument();
    });

    it("defaults to Inbox tab (no ?view param)", () => {
      mockListSources.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      expect(screen.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("activates the Saved tab when ?view=saved is in the URL", () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover("/discover?view=saved");

      expect(screen.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Inbox tab — empty state
  // -------------------------------------------------------------------------

  describe("inbox tab — empty state", () => {
    it("shows no-saved-searches empty state when there are no sources", () => {
      mockListSources.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      expect(
        screen.getByRole("heading", { name: "No saved searches yet" }),
      ).toBeInTheDocument();
    });

    it("shows inbox-empty state when sources exist but inbox has no jobs", () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      expect(
        screen.getByRole("heading", { name: "Inbox empty" }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Inbox tab — error branch
  // -------------------------------------------------------------------------

  describe("inbox tab — error state", () => {
    it("shows error message when inbox query fails", () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      expect(
        screen.getByText(/Couldn't load the inbox/i),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Saved tab — empty state
  // -------------------------------------------------------------------------

  describe("saved tab — empty state", () => {
    it("shows saved-empty state when there are no saved jobs", async () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover("/discover?view=saved");

      expect(
        screen.getByRole("heading", { name: "No saved jobs" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/When you save a posting from the inbox/i),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Saved tab — populated state
  // -------------------------------------------------------------------------

  describe("saved tab — populated", () => {
    it("renders saved job cards when saved jobs exist", () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [aJob], total: 1 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover("/discover?view=saved");

      expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Saved tab — error branch
  // -------------------------------------------------------------------------

  describe("saved tab — error state", () => {
    it("shows error message when saved jobs query fails", () => {
      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover("/discover?view=saved");

      expect(
        screen.getByText(/Couldn't load saved jobs/i),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------

  describe("tab switching", () => {
    it("switches to Saved tab when the Saved tab is clicked", async () => {
      const user = userEvent.setup();

      mockListSources.mockReturnValue({
        data: [aSource],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
      mockListJobs.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);

      renderDiscover();

      // Initially on Inbox
      expect(screen.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await user.click(screen.getByRole("tab", { name: "Saved" }));

      expect(screen.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("heading", { name: "No saved jobs" }),
      ).toBeInTheDocument();
    });
  });
});
