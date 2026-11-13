/**
 * The Dismissed tab and Restore, for real: the real list view, card, store and shared Toaster
 * against a faked HTTP layer that, like the backend, lists a dismissed posting under Dismissed
 * until undo-dismiss moves it back to the inbox. Covers Restore staying disabled after it succeeds
 * until the card leaves, a 404 (restored elsewhere) and a 500.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { Toaster } from "@platform/ui";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DiscoverListView from "@/features/discover/DiscoverListView";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: () => ({ data: undefined }) }));

const JOB_ID = "job-dismissed-1";
const TITLE = "Backend Engineer";
const RESTORE = `Restore ${TITLE} at Acme Corp`;
const POSTING: DiscoveredJob = {
  id: JOB_ID,
  source: "jsearch",
  source_publisher: null,
  source_url: "https://example.com/jobs/1",
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
  dismissed_at: "2026-11-11T12:00:00Z",
  dismissed_reason: "wrong_stack",
  saved_at: null,
  promoted_application_id: null,
  verdict: null,
  discovery_source_id: null,
};

const listRequests: string[] = [];
let restored = false;
let undoStatus = 204;
let releaseUndo: () => void = () => {};
let undoGate: Promise<void> = Promise.resolve();
/** When set, the list reads after a restore wait for it, so the moment between toast and card leaving can be seen. */
let refetchGate: Promise<void> | null = null;

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  if (status >= 400) {
    return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response: { status, data, statusText: "", headers: {}, config } }));
  }
  return Promise.resolve({ data, status, statusText: "", headers: {}, config });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === "/discover/sources") return reply(config, 200, []);
    if (config.url === "/discover") {
      listRequests.push(config.params.state);
      if (restored && refetchGate) await refetchGate;
      const items = restored ? [] : [POSTING];
      return reply(config, 200, { items, total: items.length, has_more: false, state: config.params.state, scored_count: null, total_count: null });
    }
    // undo-dismiss: held until the test releases it, so the in-flight state can be seen.
    await undoGate;
    if (undoStatus === 500) return reply(config, 500, undefined);
    // Either this restore, or (for a 404) one on another device a moment ago, has moved it to the inbox.
    restored = true;
    if (undoStatus === 404) return reply(config, 404, { detail: "Discovery resource not found" });
    return reply(config, 204, undefined);
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  listRequests.length = 0;
  restored = false;
  undoStatus = 204;
  refetchGate = null;
  // Made before each test, so releasing it works whether or not the request has reached the adapter.
  undoGate = new Promise<void>((resolve) => (releaseUndo = resolve));
});

afterEach(() => vi.useRealTimers());

function renderDismissed(): void {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Toaster />
        <DiscoverListView view="dismissed" activeSourceId={null} onShowAllSources={vi.fn()} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("the Dismissed tab", () => {
  it("lists a dismissed posting with when and why, and Restore in place of the triage buttons", async () => {
    renderDismissed();

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(listRequests).toEqual(["dismissed"]);
    expect(screen.getByTestId("dismissal-summary")).toHaveTextContent("Dismissed 2 days ago · Wrong tech stack");
    expect(screen.getByRole("button", { name: RESTORE })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://example.com/jobs/1");
    expect(screen.queryByRole("button", { name: /Apply/ })).toBeNull();
    expect(screen.queryByTestId("save-button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss this posting" })).toBeNull();
  });

  it("Restore shows it's working at once, then confirms and drops the posting from the list", async () => {
    renderDismissed();
    fireEvent.click(await screen.findByRole("button", { name: RESTORE }));

    const pending = await screen.findByRole("button", { name: RESTORE });
    expect(pending).toBeDisabled();
    expect(pending).toHaveTextContent("Restoring…");

    releaseUndo();

    expect(await screen.findByText("Posting restored to your inbox")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(await screen.findByText("No dismissed jobs")).toBeInTheDocument();
    expect(listRequests).toEqual(["dismissed", "dismissed"]);
  });

  it("Restore stays disabled after it succeeds, until the refetched list drops the card", async () => {
    let releaseRefetch: () => void = () => {};
    refetchGate = new Promise<void>((resolve) => (releaseRefetch = resolve));
    renderDismissed();
    fireEvent.click(await screen.findByRole("button", { name: RESTORE }));
    releaseUndo();

    expect(await screen.findByText("Posting restored to your inbox")).toBeInTheDocument();
    await waitFor(() => expect(listRequests).toEqual(["dismissed", "dismissed"]));
    // The card is still on screen while the list refetches; a second tap would 404, so Restore stays off.
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RESTORE })).toBeDisabled();

    releaseRefetch();
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  });

  it("Restore on a posting already restored elsewhere says so in plain words, and the card goes", async () => {
    undoStatus = 404;
    renderDismissed();
    fireEvent.click(await screen.findByRole("button", { name: RESTORE }));
    releaseUndo();

    expect(await screen.findByText("This posting can no longer be brought back. It may already be in your inbox.")).toBeInTheDocument();
    expect(screen.queryByText("Discovery resource not found")).toBeNull();
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(await screen.findByText("No dismissed jobs")).toBeInTheDocument();
  });

  it("a Restore the server fails says it couldn't, keeps the posting, and offers Restore again", async () => {
    undoStatus = 500;
    renderDismissed();
    fireEvent.click(await screen.findByRole("button", { name: RESTORE }));
    await waitFor(() => expect(screen.getByRole("button", { name: RESTORE })).toBeDisabled());

    releaseUndo();

    expect(await screen.findByText("Couldn't restore this posting")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: RESTORE })).toBeEnabled());
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });
});
