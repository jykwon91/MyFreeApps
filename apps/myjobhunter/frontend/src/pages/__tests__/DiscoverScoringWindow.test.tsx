/**
 * The Discover page end to end for the scoring window: a saved search's refresh, in the panel,
 * opens the window the page owns, and the inbox (a sibling) polls and shows cards as scoring.
 * The API is mocked at the RTK Query hooks, as the other page tests do; the panel, rows, inbox
 * and cards are the real components. The new-search dialog is stubbed: it is closed and not under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Discover from "@/pages/Discover";
import { INBOX_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/discoverScoring";
import {
  useListDiscoverySourcesQuery,
  useRefreshDiscoverySourceMutation,
} from "@myjobhunter/api-client/store/discoverApi";
import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import type { DiscoveredJobsPagesState } from "@myjobhunter/api-client/types/discovery/discovered-jobs-pages-state";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

const idleMutation = () => [vi.fn(), { isLoading: false }];

vi.mock("@myjobhunter/api-client/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: vi.fn(),
  useRefreshDiscoverySourceMutation: vi.fn(),
  useDeactivateDiscoverySourceMutation: () => idleMutation(),
  useUpdateDiscoverySourceMutation: () => idleMutation(),
  useCreateDiscoverySourceMutation: () => idleMutation(),
  useSaveDiscoveredJobMutation: () => idleMutation(),
  useDismissDiscoveredJobMutation: () => idleMutation(),
  useUndoDismissDiscoveredJobMutation: () => idleMutation(),
  usePromoteDiscoveredJobMutation: () => idleMutation(),
}));

vi.mock("@myjobhunter/api-client/hooks/useDiscoveredJobsPages", () => ({ useDiscoveredJobsPages: vi.fn() }));

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({
  useGetProfileQuery: () => ({ data: undefined }),
  useUpdateProfileMutation: () => idleMutation(),
}));

vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({
  useListSkillsQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/discover/NewSavedSearchDialog", () => ({ default: () => null }));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const SOURCE = {
  id: "src-1",
  source: "jsearch",
  name: "Backend roles",
  config: { roles: ["Backend Engineer"] },
  is_active: true,
  fetch_interval_minutes: 1440,
  last_fetched_at: null,
  last_success_at: null,
  last_error_at: null,
  last_error_message: null,
  consecutive_failures: 0,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
} as unknown as DiscoverySource;

const UNSCORED = {
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
  salary_min: null,
  salary_max: null,
  salary_currency: "USD",
  salary_period: null,
  score: null,
  score_reason: null,
  scored_at: null,
  dismissed_at: null,
  dismissed_reason: null,
  saved_at: null,
  promoted_application_id: null,
  verdict: null,
  discovery_source_id: "src-1",
} as unknown as DiscoveredJob;

const mockSources = vi.mocked(useListDiscoverySourcesQuery);
const mockJobs = vi.mocked(useDiscoveredJobsPages);
const mockRefresh = vi.mocked(useRefreshDiscoverySourceMutation);
const refresh = vi.fn();

const fetched = { fetch_id: "f", status: "success", fetched_count: 4, new_count: 1, updated_count: 0, duration_ms: 1, error_message: null };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The polling interval the inbox last asked RTK Query for. */
function lastPollingInterval(): number | undefined {
  const calls = mockJobs.mock.calls;
  return calls[calls.length - 1]?.[1];
}

describe("Discover page — a refresh and the inbox's scoring window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSources.mockReturnValue({ data: [SOURCE], isLoading: false, isError: false } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
    mockJobs.mockReturnValue({
      jobs: [UNSCORED],
      total: 1,
      scoredCount: 0,
      totalCount: 1,
      isLoading: false,
      isFiltering: false,
      loadError: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoadMoreError: false,
    } as unknown as DiscoveredJobsPagesState);
    mockRefresh.mockReturnValue([refresh, { isLoading: false }] as unknown as ReturnType<typeof useRefreshDiscoverySourceMutation>);
  });

  it("starts idle: no polling and the static Not scored pill", () => {
    renderPage();
    expect(lastPollingInterval()).toBe(0);
    expect(screen.queryByTestId("discovered-job-scoring-spinner")).toBeNull();
  });

  it("shows the inbox's cards as scoring and polls once a refresh adds postings", async () => {
    refresh.mockReturnValue({ unwrap: () => Promise.resolve(fetched) });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^refresh/i }));

    expect(await screen.findByTestId("discovered-job-scoring-spinner")).toBeInTheDocument();
    expect(lastPollingInterval()).toBe(INBOX_POLL_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledWith("src-1");
  });

  it("stays idle when the refresh fails", async () => {
    refresh.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: undefined }) });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^refresh/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId("discovered-job-scoring-spinner")).toBeNull();
    expect(lastPollingInterval()).toBe(0);
  });

  it("stays idle when the refresh found nothing new", async () => {
    refresh.mockReturnValue({ unwrap: () => Promise.resolve({ ...fetched, new_count: 0 }) });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^refresh/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId("discovered-job-scoring-spinner")).toBeNull();
    expect(lastPollingInterval()).toBe(0);
  });
});
