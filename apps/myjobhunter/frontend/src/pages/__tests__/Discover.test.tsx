/**
 * Tests for Discover page — Saved tab, error branches, and tab navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Discover from "@/pages/Discover";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks — only the two query hooks are used directly by
// Discover.tsx; mutations live in sub-components that are mocked below.
// ---------------------------------------------------------------------------

vi.mock("@/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: vi.fn(),
  useListDiscoveredJobsQuery: vi.fn(),
}));

// Sub-components with their own RTK wiring are mocked so this test file
// stays lean and doesn't need a Redux Provider.
vi.mock("@/features/discover/NewSavedSearchDialog", () => ({
  default: ({ open }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="new-search-dialog" /> : null,
}));

vi.mock("@/features/discover/SavedSearchesPanel", () => ({
  default: () => <div data-testid="saved-searches-panel" />,
}));

vi.mock("@/features/discover/DiscoverInboxView", () => ({
  default: ({ hasSources }: { hasSources: boolean }) => (
    <div data-testid="inbox-view" data-has-sources={String(hasSources)} />
  ),
}));

vi.mock("@/features/discover/DiscoverSavedView", () => ({
  default: () => <div data-testid="saved-view" />,
}));

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
} from "@/store/discoverApi";

const mockListSources = vi.mocked(useListDiscoverySourcesQuery);
const mockListJobs = vi.mocked(useListDiscoveredJobsQuery);

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

function stubQueries(opts: { hasSources?: boolean } = {}) {
  const sources = opts.hasSources ? [aSource] : [];
  mockListSources.mockReturnValue({
    data: sources,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
  mockListJobs.mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useListDiscoveredJobsQuery>);
}

describe("Discover page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Tab rendering
  // -------------------------------------------------------------------------

  describe("tab bar", () => {
    it("renders Inbox and Saved tabs", () => {
      stubQueries();
      renderDiscover();

      expect(screen.getByRole("tab", { name: "Inbox" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Saved" })).toBeInTheDocument();
    });

    it("defaults to Inbox tab (no ?view param)", () => {
      stubQueries();
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
      stubQueries({ hasSources: true });
      renderDiscover("/discover?view=saved");

      expect(screen.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  // -------------------------------------------------------------------------
  // View routing
  // -------------------------------------------------------------------------

  describe("view routing", () => {
    it("renders InboxView when ?view is absent", () => {
      stubQueries();
      renderDiscover();

      expect(screen.getByTestId("inbox-view")).toBeInTheDocument();
      expect(screen.queryByTestId("saved-view")).toBeNull();
    });

    it("renders SavedView when ?view=saved", () => {
      stubQueries({ hasSources: true });
      renderDiscover("/discover?view=saved");

      expect(screen.getByTestId("saved-view")).toBeInTheDocument();
      expect(screen.queryByTestId("inbox-view")).toBeNull();
    });

    it("passes hasSources=true to InboxView when sources exist", () => {
      stubQueries({ hasSources: true });
      renderDiscover();

      expect(screen.getByTestId("inbox-view")).toHaveAttribute(
        "data-has-sources",
        "true",
      );
    });

    it("passes hasSources=false to InboxView when no sources", () => {
      stubQueries({ hasSources: false });
      renderDiscover();

      expect(screen.getByTestId("inbox-view")).toHaveAttribute(
        "data-has-sources",
        "false",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------

  describe("tab switching", () => {
    it("switches to Saved view when the Saved tab is clicked", async () => {
      const user = userEvent.setup();
      stubQueries({ hasSources: true });
      renderDiscover();

      // Initially on Inbox
      expect(screen.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByTestId("inbox-view")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Saved" }));

      expect(screen.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByTestId("saved-view")).toBeInTheDocument();
      expect(screen.queryByTestId("inbox-view")).toBeNull();
    });

    it("switches back to Inbox view when the Inbox tab is clicked from Saved", async () => {
      const user = userEvent.setup();
      stubQueries({ hasSources: true });
      renderDiscover("/discover?view=saved");

      // Initially on Saved
      expect(screen.getByTestId("saved-view")).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Inbox" }));

      expect(screen.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByTestId("inbox-view")).toBeInTheDocument();
    });
  });
});
