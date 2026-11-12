/**
 * Undo after dismissing, for real: the real inbox, card, store and shared Toaster against a faked
 * HTTP layer that, like the backend, leaves dismissed postings out of the inbox. No test-only
 * Toast provider: the app has none besides the Toaster's, so neither does this test.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { Toaster } from "@platform/ui";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DiscoverInboxView from "@/features/discover/DiscoverInboxView";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: () => ({ data: undefined }) }));
vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({ useListSkillsQuery: () => ({ data: undefined }) }));

const CLOSED_WINDOW: ScoringWindow = { isOpen: false, pollingInterval: 0, open: vi.fn(), observe: vi.fn() };
const JOB_ID = "job-undo-1";
const TITLE = "Backend Engineer";
const POSTING: DiscoveredJob = {
  id: JOB_ID,
  source: "jsearch",
  source_publisher: null,
  source_url: null,
  title: TITLE,
  company_name: "Acme Corp",
  location: "Remote",
  remote_type: "remote",
  description: null,
  posted_at: null,
  discovered_at: "2026-11-01T00:00:00Z",
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
};

const actions: string[] = [];
let dismissed = false;
let failUndo = false;

function respond(config: InternalAxiosRequestConfig): { status: number; data: unknown } {
  if (config.url === "/discover/sources") return { status: 200, data: [] };
  if (config.url === "/discover") {
    const items = dismissed ? [] : [POSTING];
    return { status: 200, data: { items, total: items.length, has_more: false, state: "inbox", scored_count: 0, total_count: items.length } };
  }
  const action = config.url?.split("/").pop() ?? "";
  actions.push(action);
  if (action === "undo-dismiss" && failUndo) return { status: 500, data: { detail: "boom" } };
  dismissed = action === "dismiss";
  return { status: 204, data: undefined };
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    const { status, data } = respond(config);
    if (status >= 400) {
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response: { status, data, statusText: "", headers: {}, config } }));
    }
    return Promise.resolve({ data, status, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  actions.length = 0;
  dismissed = false;
  failUndo = false;
});

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;

/** Undo runs after its card unmounted, so no hook is left to clear a mutation record it leaves. */
function undoMutationRecords(store: Store): unknown[] {
  return Object.values(store.getState()[baseApi.reducerPath].mutations).filter(
    (entry) => entry?.endpointName === "undoDismissDiscoveredJob",
  );
}

function renderInbox(): Store {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Toaster />
        <DiscoverInboxView hasSources activeSourceId={null} scoringWindow={CLOSED_WINDOW} />
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function dismissThePosting(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Dismiss this posting" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip — dismiss without a reason" }));
  expect(await screen.findByText("Dismissed.")).toBeInTheDocument();
  // The refetched inbox drops the posting, unmounting its card; the toast stays.
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
}

describe("Undo after dismissing a posting", () => {
  it("keeps the Undo toast after the card leaves, and Undo brings the posting back", async () => {
    const store = renderInbox();
    await dismissThePosting();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Undoing…" })).toBeDisabled();

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(await screen.findByText("Posting brought back")).toBeInTheDocument();
    expect(actions).toEqual(["dismiss", "undo-dismiss"]);
    await waitFor(() => expect(screen.queryByText("Dismissed.")).toBeNull());
    expect(undoMutationRecords(store)).toEqual([]);
  });

  it("lets the dismissal stand when the toast closes without Undo", async () => {
    renderInbox();
    await dismissThePosting();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(screen.queryByText("Dismissed.")).toBeNull());
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(actions).toEqual(["dismiss"]);
  });

  it("says so when Undo fails, and the posting stays dismissed", async () => {
    failUndo = true;
    const store = renderInbox();
    await dismissThePosting();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Dismissed.")).toBeNull());
    expect(actions).toEqual(["dismiss", "undo-dismiss"]);
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByText("Posting brought back")).toBeNull();
    expect(undoMutationRecords(store)).toEqual([]);
  });
});
