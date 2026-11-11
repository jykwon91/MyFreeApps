/**
 * The inbox paging for real: the real hook, store and Load more footer against a faked HTTP layer.
 * Later pages append without reloading earlier ones, Retry reloads a failed list, and switching
 * saved search starts again from the first page.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DiscoverInboxView from "@/features/discover/DiscoverInboxView";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";
import "@myjobhunter/api-client/store/discoverApi";

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: () => ({ data: undefined }) }));
vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({ useListSkillsQuery: () => ({ data: undefined }) }));
vi.mock("@/features/discover/DiscoveredJobCard", () => ({
  default: ({ job }: { job: { id: string } }) => <div data-testid="job-card">{job.id}</div>,
}));

const CLOSED_WINDOW: ScoringWindow = { isOpen: false, pollingInterval: 0, open: vi.fn(), observe: vi.fn() };
const TOTAL = 230;
const PAGE = 50;

const sent: InternalAxiosRequestConfig[] = [];
let failJobs = false;

function jobRequests(): InternalAxiosRequestConfig[] {
  return sent.filter((config) => config.url === "/discover");
}

function respond(config: InternalAxiosRequestConfig): { status: number; data: unknown } {
  if (config.url === "/discover/sources") return { status: 200, data: [] };
  if (failJobs) return { status: 500, data: { detail: "boom" } };
  const offset = config.params.offset as number;
  const source = (config.params.source_id as string | undefined) ?? "all";
  const count = Math.min(PAGE, TOTAL - offset);
  const items = Array.from({ length: count }, (_, i) => ({ id: `${source}-${offset + i}` }));
  return { status: 200, data: { items, total: TOTAL, has_more: offset + count < TOTAL, state: "inbox", scored_count: 0, total_count: TOTAL } };
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const { status, data } = respond(config);
    if (status >= 400) {
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response: { status, data, statusText: "", headers: {}, config } }));
    }
    return Promise.resolve({ data, status, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  failJobs = false;
});

function renderInbox(activeSourceId: string | null = null) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  const tree = (id: string | null) => (
    <Provider store={store}>
      <MemoryRouter>
        <DiscoverInboxView hasSources activeSourceId={id} scoringWindow={CLOSED_WINDOW} />
      </MemoryRouter>
    </Provider>
  );
  const view = render(tree(activeSourceId));
  return { rerenderWith: (id: string | null) => view.rerender(tree(id)) };
}

describe("DiscoverInboxView paging", () => {
  it("appends each page without reloading earlier ones, past the old 200 cap", async () => {
    renderInbox();
    await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(PAGE));
    expect(screen.getByText(`Showing ${PAGE} of ${TOTAL} postings`)).toBeInTheDocument();

    for (const loaded of [100, 150, 200, TOTAL]) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(loaded));
    }

    expect(jobRequests().map((config) => config.params.offset)).toEqual([0, 50, 100, 150, 200]);
    expect(jobRequests().every((config) => config.params.limit === PAGE)).toBe(true);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("offers Retry when the inbox can't load, and reloads it", async () => {
    failJobs = true;
    renderInbox();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the inbox.");

    failJobs = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(PAGE));
  });

  it("starts from the first page again when the saved search changes", async () => {
    const { rerenderWith } = renderInbox();
    await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(PAGE));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(PAGE * 2));

    rerenderWith("s1");
    await waitFor(() => expect(screen.getAllByTestId("job-card")).toHaveLength(PAGE));
    expect(screen.getAllByTestId("job-card")[0]).toHaveTextContent("s1-0");
    const last = jobRequests()[jobRequests().length - 1];
    expect(last.params).toMatchObject({ source_id: "s1", offset: 0 });
  });
});
