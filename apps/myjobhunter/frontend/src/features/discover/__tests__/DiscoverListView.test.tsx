/**
 * The Saved and Dismissed tabs: filtered by the active saved search like the inbox, paged with
 * "Load more", and their cards get the sources and profile the inbox's cards get.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DiscoverListView from "../DiscoverListView";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoveredJobsPagesState } from "@myjobhunter/api-client/types/discovery/discovered-jobs-pages-state";

const { usePages, loadMore, refetch, showAll, cardProps } = vi.hoisted(() => ({
  usePages: vi.fn(),
  loadMore: vi.fn(),
  refetch: vi.fn(),
  showAll: vi.fn(),
  cardProps: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/hooks/useDiscoveredJobsPages", () => ({ useDiscoveredJobsPages: usePages }));
vi.mock("@myjobhunter/api-client/store/discoverApi", () => ({
  useListDiscoverySourcesQuery: () => ({ data: [{ id: "s1" }] }),
}));
vi.mock("@myjobhunter/api-client/store/profileApi", () => ({
  useGetProfileQuery: () => ({ data: { updated_at: "2026-11-01T00:00:00Z" } }),
}));
vi.mock("../DiscoveredJobCard", () => ({
  default: (props: { job: { title: string } }) => {
    cardProps(props);
    return <div>{props.job.title}</div>;
  },
}));
vi.mock("../DiscoveredJobsSkeleton", () => ({
  default: ({ view }: { view?: string }) => <div data-testid="jobs-skeleton" data-view={view} />,
}));

function pages(overrides: Partial<DiscoveredJobsPagesState> = {}): DiscoveredJobsPagesState {
  return {
    jobs: [],
    total: 0,
    isLoading: false,
    hasData: true,
    isFiltering: false,
    loadError: undefined,
    error: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoadMoreError: false,
    loadMore,
    refetch,
    scoredCount: null,
    totalCount: null,
    ...overrides,
  };
}

const job = (id: string) => ({ id, title: `Job ${id}` }) as unknown as DiscoveredJob;

describe("DiscoverListView — Saved", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists saved jobs for the active saved search", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 1 }));
    render(<DiscoverListView view="saved" activeSourceId="s1" onShowAllSources={showAll} />);
    expect(usePages).toHaveBeenCalledWith({ state: "saved", source_id: "s1" }, 0);
    expect(screen.getByText("Job a")).toBeInTheDocument();
    expect(cardProps).toHaveBeenCalledWith(expect.objectContaining({ profileUpdatedAt: "2026-11-01T00:00:00Z", sources: [{ id: "s1" }] }));
  });

  it("lists every saved job without a filter", () => {
    usePages.mockReturnValue(pages());
    render(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(usePages).toHaveBeenCalledWith({ state: "saved" }, 0);
  });

  it("loads the next page", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 2, hasNextPage: true }));
    render(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText("Showing 1 of 2 saved jobs")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Load more"));
    expect(loadMore).toHaveBeenCalled();
  });

  it("says when the next page couldn't load", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 2, hasNextPage: true, isLoadMoreError: true }));
    render(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText("Couldn't load more saved jobs.")).toBeInTheDocument();
    expect(screen.getByText("Job a")).toBeInTheDocument();
  });

  it("shows the skeleton, not the last search's jobs, while a new filter loads", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 1, isFiltering: true }));
    render(<DiscoverListView view="saved" activeSourceId="s1" onShowAllSources={showAll} />);
    expect(screen.getByTestId("jobs-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Job a")).not.toBeInTheDocument();
  });

  it("offers every saved search when the chosen one has nothing saved", () => {
    usePages.mockReturnValue(pages());
    render(<DiscoverListView view="saved" activeSourceId="s1" onShowAllSources={showAll} />);
    expect(screen.getByText("No saved jobs from this search")).toBeInTheDocument();
    expect(screen.queryByText("No saved jobs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show every saved search" }));
    expect(showAll).toHaveBeenCalledTimes(1);
  });

  it("retries a list that couldn't load, showing it's working", async () => {
    let finish: () => void = () => {};
    refetch.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    usePages.mockReturnValue(pages({ loadError: { status: 500 } }));
    render(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load saved jobs.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Retrying...")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled());
  });

  it("shows the skeleton, the empty state and the error", () => {
    usePages.mockReturnValue(pages({ isLoading: true }));
    const { rerender } = render(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByTestId("jobs-skeleton")).toBeInTheDocument();

    usePages.mockReturnValue(pages());
    rerender(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText("No saved jobs")).toBeInTheDocument();

    usePages.mockReturnValue(pages({ loadError: { status: 500 } }));
    rerender(<DiscoverListView view="saved" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText(/Couldn't load saved jobs/)).toBeInTheDocument();
  });
});

describe("DiscoverListView — Dismissed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists dismissed jobs for the active saved search", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 1 }));
    render(<DiscoverListView view="dismissed" activeSourceId="s1" onShowAllSources={showAll} />);
    expect(usePages).toHaveBeenCalledWith({ state: "dismissed", source_id: "s1" }, 0);
    expect(screen.getByText("Job a")).toBeInTheDocument();
  });

  it("pages with its own wording", () => {
    usePages.mockReturnValue(pages({ jobs: [job("a")], total: 2, hasNextPage: true }));
    render(<DiscoverListView view="dismissed" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText("Showing 1 of 2 dismissed jobs")).toBeInTheDocument();
  });

  it("shows the Dismissed skeleton while loading", () => {
    usePages.mockReturnValue(pages({ isLoading: true }));
    render(<DiscoverListView view="dismissed" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByTestId("jobs-skeleton")).toHaveAttribute("data-view", "dismissed");
  });

  it("explains an empty Dismissed list, and offers every saved search when filtered", () => {
    usePages.mockReturnValue(pages());
    const { rerender } = render(<DiscoverListView view="dismissed" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByText("No dismissed jobs")).toBeInTheDocument();

    rerender(<DiscoverListView view="dismissed" activeSourceId="s1" onShowAllSources={showAll} />);
    expect(screen.getByText("No dismissed jobs from this search")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show every saved search" }));
    expect(showAll).toHaveBeenCalledTimes(1);
  });

  it("says when the list couldn't load", () => {
    usePages.mockReturnValue(pages({ loadError: { status: 500 } }));
    render(<DiscoverListView view="dismissed" activeSourceId={null} onShowAllSources={showAll} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load dismissed jobs.");
  });
});
