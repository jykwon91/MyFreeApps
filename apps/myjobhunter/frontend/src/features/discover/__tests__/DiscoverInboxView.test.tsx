/**
 * Tests for DiscoverInboxView — the bounded scoring window and coverage line
 * (fix/mjh-discovery-scoring-state).
 *
 * Regression focus: a steady inbox with a permanently-unscored tail must NOT
 * poll forever, and unscored cards must render the static state (not the
 * animated spinner). The scorer only rates the daily prefilter top-N, so a
 * large unscored tail is expected — the coverage line makes that legible.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiscoverInboxView from "@/features/discover/DiscoverInboxView";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";

vi.mock("@myjobhunter/api-client/hooks/useDiscoveredJobsPages", () => ({ useDiscoveredJobsPages: vi.fn() }));

vi.mock("@myjobhunter/api-client/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({
  useGetProfileQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({
  useListSkillsQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  EmptyState: ({ heading }: { heading: string }) => <div>{heading}</div>,
}));

vi.mock("@/features/discover/DiscoveredJobsSkeleton", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("@/features/discover/ProfileCompletenessBanner", () => ({
  default: (props: { hasResume: boolean; hasSkills: boolean }) => (
    <div data-testid="profile-banner" data-has-resume={String(props.hasResume)} data-has-skills={String(props.hasSkills)} />
  ),
}));

// Capture the isScoringInFlight prop each card receives so we can assert
// the steady state passes a STATIC (false) signal, not an animated one.
const cardSpy = vi.fn();
vi.mock("@/features/discover/DiscoveredJobCard", () => ({
  default: (props: { job: DiscoveredJob; isScoringInFlight?: boolean }) => {
    cardSpy(props.isScoringInFlight);
    return <div data-testid="job-card">{props.job.title}</div>;
  },
}));

import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import type { DiscoveredJobsPagesState } from "@myjobhunter/api-client/types/discovery/discovered-jobs-pages-state";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";

const mockListJobs = vi.mocked(useDiscoveredJobsPages);
const mockListSources = vi.mocked(useListDiscoverySourcesQuery);

function makeJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
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
    saved_at: null,
    promoted_application_id: null,
    verdict: null,
    discovery_source_id: null,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<DiscoveredJobsPagesState> = {}): DiscoveredJobsPagesState {
  return {
    jobs: [makeJob()],
    total: 1,
    scoredCount: 0,
    totalCount: 1,
    isLoading: false,
    hasData: true,
    isFiltering: false,
    loadError: undefined,
    error: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoadMoreError: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

const CLOSED_WINDOW: ScoringWindow = { isOpen: false, pollingInterval: 0, open: vi.fn(), observe: vi.fn() };

function renderInbox(scoringWindow: ScoringWindow = CLOSED_WINDOW) {
  return render(
    <MemoryRouter>
      <DiscoverInboxView hasSources activeSourceId={null} scoringWindow={scoringWindow} />
    </MemoryRouter>,
  );
}

const jobsResult = (state: DiscoveredJobsPagesState) => state;

describe("DiscoverInboxView — bounded scoring window", () => {
  beforeEach(() => {
    cardSpy.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockListSources.mockReturnValue({ data: [] } as any);
  });

  it("does NOT poll in the steady state (a permanently-unscored tail must not poll forever)", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scoredCount: 20, totalCount: 100 })),
    );
    renderInbox();

    // The second arg is the polling interval; a closed window means 0 (no polling).
    expect(mockListJobs).toHaveBeenCalled();
    expect(mockListJobs.mock.calls[0][1]).toBe(0);
  });

  it("passes a static (false) isScoringInFlight to cards in the steady state", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scoredCount: 0, totalCount: 1 })),
    );
    renderInbox();
    // Every card render in the steady state must receive false → static
    // "Not scored" pill, never the animated spinner.
    expect(cardSpy).toHaveBeenCalled();
    expect(cardSpy.mock.calls.every(([flag]) => flag === false)).toBe(true);
  });

  it("polls and shows cards as scoring while the page's window is open", () => {
    mockListJobs.mockReturnValue(jobsResult(makeResponse({ scoredCount: 0, totalCount: 1 })));
    renderInbox({ isOpen: true, pollingInterval: 4000, open: vi.fn(), observe: vi.fn() });
    expect(mockListJobs.mock.calls[0][1]).toBe(4000);
    expect(cardSpy.mock.calls.every(([flag]) => flag === true)).toBe(true);
  });

  it("renders the coverage line 'Scored N of M' from the response counts", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scoredCount: 20, totalCount: 100 })),
    );
    renderInbox();
    const coverage = screen.getByTestId("inbox-scoring-coverage");
    expect(coverage).toHaveTextContent("Scored 20 of 100");
    // Unscored tail → the "next daily scoring pass" framing so it doesn't
    // read as broken.
    expect(coverage).toHaveTextContent(/next daily scoring pass/i);
  });

  it("omits the unscored-tail framing when every row is scored", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scoredCount: 5, totalCount: 5 })),
    );
    renderInbox();
    const coverage = screen.getByTestId("inbox-scoring-coverage");
    expect(coverage).toHaveTextContent("Scored 5 of 5");
    expect(coverage).not.toHaveTextContent(/next daily scoring pass/i);
  });

  it("hides the coverage line when counts are absent (saved/all views)", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scoredCount: null, totalCount: null })),
    );
    renderInbox();
    expect(screen.queryByTestId("inbox-scoring-coverage")).toBeNull();
  });
});

describe("DiscoverInboxView — list states", () => {
  beforeEach(() => {
    mockListJobs.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockListSources.mockReturnValue({ data: [] } as any);
  });

  it("asks for the inbox, narrowed to the active saved search", () => {
    mockListJobs.mockReturnValue(makeResponse());
    render(
      <MemoryRouter>
        <DiscoverInboxView hasSources activeSourceId="s1" scoringWindow={CLOSED_WINDOW} />
      </MemoryRouter>,
    );
    expect(mockListJobs).toHaveBeenCalledWith({ state: "inbox", source_id: "s1" }, 0);
  });

  it("offers Load more only when another page exists, and loads it", () => {
    const loadMore = vi.fn();
    mockListJobs.mockReturnValue(makeResponse({ hasNextPage: true, total: 120, loadMore }));
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("hides Load more when everything is loaded", () => {
    mockListJobs.mockReturnValue(makeResponse());
    renderInbox();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows the skeleton, not the last search's postings, while a new filter loads", () => {
    mockListJobs.mockReturnValue(makeResponse({ isFiltering: true }));
    renderInbox();
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("job-card")).toBeNull();
  });

  it("shows the empty state when nothing is in the inbox", () => {
    mockListJobs.mockReturnValue(makeResponse({ jobs: [], total: 0 }));
    renderInbox();
    expect(screen.getByText("Inbox empty")).toBeInTheDocument();
  });

  it("offers Retry when the inbox can't load, and retries", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockListJobs.mockReturnValue(makeResponse({ loadError: { status: 500 }, refetch }));
    renderInbox();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the inbox.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("DiscoverInboxView — profile reminder", () => {
  const mockProfile = vi.mocked(useGetProfileQuery);
  const mockSkills = vi.mocked(useListSkillsQuery);

  beforeEach(() => {
    mockListSources.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useListDiscoverySourcesQuery>);
    mockListJobs.mockReturnValue(jobsResult(makeResponse()));
  });

  it("waits for the profile and skills to load before showing it, so it doesn't flash", () => {
    mockProfile.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useGetProfileQuery>);
    mockSkills.mockReturnValue({ data: { items: [], total: 0 } } as unknown as ReturnType<typeof useListSkillsQuery>);
    renderInbox();
    expect(screen.queryByTestId("profile-banner")).toBeNull();
  });

  it("shows it once both have loaded, with what's missing", () => {
    mockProfile.mockReturnValue({ data: { resume_file_path: null } } as unknown as ReturnType<typeof useGetProfileQuery>);
    mockSkills.mockReturnValue({ data: { items: [], total: 0 } } as unknown as ReturnType<typeof useListSkillsQuery>);
    renderInbox();
    const banner = screen.getByTestId("profile-banner");
    expect(banner).toHaveAttribute("data-has-resume", "false");
    expect(banner).toHaveAttribute("data-has-skills", "false");
  });
});
