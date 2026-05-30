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
import type { DiscoveredJob } from "@/types/discovery/discovered-job";
import type { DiscoveredJobListResponse } from "@/types/discovery/discovered-job-list-response";

vi.mock("@/store/discoverApi", () => ({
  useListDiscoveredJobsQuery: vi.fn(),
  useListDiscoverySourcesQuery: vi.fn(),
}));

vi.mock("@/lib/profileApi", () => ({
  useGetProfileQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@/lib/skillsApi", () => ({
  useListSkillsQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@platform/ui", () => ({
  EmptyState: ({ heading }: { heading: string }) => <div>{heading}</div>,
  // Minimal LoadingButton: render children (or loadingText while loading) and
  // pass through data-testid / onClick. Strip variant/size so React doesn't
  // warn about unknown DOM attributes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LoadingButton: ({ children, loadingText, isLoading, disabled, variant: _variant, size: _size, ...props }: any) => (
    <button disabled={disabled || isLoading} {...props}>
      {isLoading ? loadingText ?? children : children}
    </button>
  ),
}));

vi.mock("@/features/discover/DiscoveredJobsSkeleton", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("@/features/discover/ProfileCompletenessBanner", () => ({
  default: () => null,
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

import {
  useListDiscoveredJobsQuery,
  useListDiscoverySourcesQuery,
} from "@/store/discoverApi";

const mockListJobs = vi.mocked(useListDiscoveredJobsQuery);
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

function makeResponse(
  overrides: Partial<DiscoveredJobListResponse> = {},
): DiscoveredJobListResponse {
  return {
    items: [makeJob()],
    total: 1,
    has_more: false,
    state: "inbox",
    scored_count: 0,
    total_count: 1,
    ...overrides,
  };
}

function renderInbox() {
  return render(
    <MemoryRouter>
      <DiscoverInboxView hasSources activeSourceId={null} />
    </MemoryRouter>,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jobsResult(data: DiscoveredJobListResponse): any {
  return { data, isLoading: false, isError: false, isFetching: false };
}

describe("DiscoverInboxView — bounded scoring window", () => {
  beforeEach(() => {
    cardSpy.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockListSources.mockReturnValue({ data: [] } as any);
  });

  it("does NOT poll in the steady state (a permanently-unscored tail must not poll forever)", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scored_count: 20, total_count: 100 })),
    );
    renderInbox();

    // The second positional arg to useListDiscoveredJobsQuery is the
    // options bag. On first render (no fresh fetch detected) the window is
    // closed → pollingInterval must be 0 (RTK Query: 0 disables polling).
    expect(mockListJobs).toHaveBeenCalled();
    const optionsArg = mockListJobs.mock.calls[0][1];
    expect(optionsArg).toMatchObject({ pollingInterval: 0 });
  });

  it("passes a static (false) isScoringInFlight to cards in the steady state", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scored_count: 0, total_count: 1 })),
    );
    renderInbox();
    // Every card render in the steady state must receive false → static
    // "Not scored" pill, never the animated spinner.
    expect(cardSpy).toHaveBeenCalled();
    expect(cardSpy.mock.calls.every(([flag]) => flag === false)).toBe(true);
  });

  it("renders the coverage line 'Scored N of M' from the response counts", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scored_count: 20, total_count: 100 })),
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
      jobsResult(makeResponse({ scored_count: 5, total_count: 5 })),
    );
    renderInbox();
    const coverage = screen.getByTestId("inbox-scoring-coverage");
    expect(coverage).toHaveTextContent("Scored 5 of 5");
    expect(coverage).not.toHaveTextContent(/next daily scoring pass/i);
  });

  it("hides the coverage line when counts are absent (saved/all views)", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ scored_count: null, total_count: null })),
    );
    renderInbox();
    expect(screen.queryByTestId("inbox-scoring-coverage")).toBeNull();
  });
});

describe("DiscoverInboxView — load more", () => {
  beforeEach(() => {
    cardSpy.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockListSources.mockReturnValue({ data: [] } as any);
  });

  it("renders the Load more control when the server reports more rows", () => {
    mockListJobs.mockReturnValue(
      jobsResult(
        makeResponse({ has_more: true, total: 120, total_count: 120, scored_count: 20 }),
      ),
    );
    renderInbox();
    expect(screen.getByTestId("inbox-load-more")).toHaveTextContent("Load more");
    expect(screen.queryByTestId("inbox-load-more-cap")).toBeNull();
  });

  it("hides the Load more control when there are no more rows", () => {
    mockListJobs.mockReturnValue(jobsResult(makeResponse({ has_more: false })));
    renderInbox();
    expect(screen.queryByTestId("inbox-load-more")).toBeNull();
    expect(screen.queryByTestId("inbox-load-more-cap")).toBeNull();
  });

  it("requests a larger limit (by one page) when Load more is clicked", () => {
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ has_more: true, total: 300, total_count: 300 })),
    );
    renderInbox();
    // First render queries the first page (limit 50, the default page size).
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "inbox", limit: 50 }),
      expect.anything(),
    );
    fireEvent.click(screen.getByTestId("inbox-load-more"));
    // Clicking grows the window to the next page (limit 100), in place.
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "inbox", limit: 100 }),
      expect.anything(),
    );
  });

  it("replaces the button with a legible note at the 200-row cap instead of truncating silently", () => {
    // Server always says there's more; the frontend ceiling (200) is what
    // stops the growth. Three clicks: 50 → 100 → 150 → 200.
    mockListJobs.mockReturnValue(
      jobsResult(makeResponse({ has_more: true, total: 999, total_count: 999 })),
    );
    renderInbox();
    fireEvent.click(screen.getByTestId("inbox-load-more"));
    fireEvent.click(screen.getByTestId("inbox-load-more"));
    fireEvent.click(screen.getByTestId("inbox-load-more"));
    // At the cap the button is gone and the note explains the ceiling.
    expect(screen.queryByTestId("inbox-load-more")).toBeNull();
    expect(screen.getByTestId("inbox-load-more-cap")).toHaveTextContent(
      /showing the first 200/i,
    );
    // Never requests beyond the backend's max limit.
    expect(mockListJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 200 }),
      expect.anything(),
    );
  });
});
