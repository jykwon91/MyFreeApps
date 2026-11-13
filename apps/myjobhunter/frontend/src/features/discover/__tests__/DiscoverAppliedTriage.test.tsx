/**
 * A posting already turned into an application can't be dismissed or saved, for real: the real
 * inbox, card, store and shared Toaster against a faked HTTP layer that, like the backend, answers
 * a coded 409 to Dismiss / Save on an applied posting and lists it in no Discover view. Covers a stale
 * card (applied on another device), Save / Dismiss staying off while Apply is in flight and gone once
 * it succeeds (before the refetched list drops the card), and Apply staying off during Save.
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
import { DISCOVER_CONFLICT_CODES } from "@myjobhunter/api-client/constants/discoverConflictCodes";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";

vi.mock("@myjobhunter/api-client/store/profileApi", () => ({ useGetProfileQuery: () => ({ data: undefined }) }));
vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({ useListSkillsQuery: () => ({ data: undefined }) }));

const CLOSED_WINDOW: ScoringWindow = { isOpen: false, pollingInterval: 0, open: vi.fn(), observe: vi.fn() };
const JOB_ID = "job-applied-1";
const TITLE = "Backend Engineer";
// What the backend's dismiss / save answer 409 with (app/core/discovered_job_conflicts.py).
const ALREADY_APPLIED_DETAIL = { code: DISCOVER_CONFLICT_CODES.alreadyApplied, message: "This posting is already in your Applications" };
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
/** The server's truth: once applied, the posting is an application and in no Discover view. */
let applied = false;
/** Requests to hold until released ("promote", "save", "list"), so an in-flight moment can be seen. */
const holding = new Set<string>();
/** Every held request of each kind: one action can refetch the same list more than once. */
const waiting = new Map<string, Array<() => void>>();

async function holdIfAsked(key: string): Promise<void> {
  if (!holding.has(key)) return;
  await new Promise<void>((resolve) => waiting.set(key, [...(waiting.get(key) ?? []), resolve]));
}

/** Lets the held requests through once one has arrived, and stops holding that kind. */
async function release(key: string): Promise<void> {
  await waitFor(() => expect(waiting.has(key)).toBe(true));
  holding.delete(key);
  waiting.get(key)?.forEach((resolve) => resolve());
  waiting.delete(key);
}

function respond(config: InternalAxiosRequestConfig): { status: number; data: unknown } {
  if (config.url === "/discover/sources") return { status: 200, data: [] };
  if (config.url === "/discover") {
    const items = applied ? [] : [POSTING];
    return { status: 200, data: { items, total: items.length, has_more: false, state: "inbox", scored_count: 0, total_count: items.length } };
  }
  const action = config.url?.split("/").pop() ?? "";
  actions.push(action);
  if (applied && (action === "dismiss" || action === "save")) return { status: 409, data: { detail: ALREADY_APPLIED_DETAIL } };
  return { status: 204, data: undefined };
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = async (config) => {
    if (config.url?.endsWith("/promote")) {
      actions.push("promote");
      await holdIfAsked("promote");
      applied = true;
      return { data: { id: "app-1" }, status: 201, statusText: "", headers: {}, config };
    }
    if (config.url === "/discover") await holdIfAsked("list");
    if (config.url?.endsWith("/save")) await holdIfAsked("save");
    const { status, data } = respond(config);
    if (status >= 400) {
      throw Object.assign(new Error("failed"), { isAxiosError: true, config, response: { status, data, statusText: "", headers: {}, config } });
    }
    return { data, status, statusText: "", headers: {}, config };
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  actions.length = 0;
  applied = false;
  holding.clear();
  waiting.clear();
});

function renderInbox(): void {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Toaster />
        <DiscoverInboxView hasSources activeSourceId={null} scoringWindow={CLOSED_WINDOW} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("a posting already in Applications", () => {
  it("Dismiss on a stale card says it's already in Applications, and the card goes", async () => {
    renderInbox();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    // Applied on another device: this inbox still shows the card.
    applied = true;

    fireEvent.click(screen.getByRole("button", { name: "Dismiss this posting" }));
    // Hold the refetch so the card is still there to show the reasons closed.
    holding.add("list");
    fireEvent.click(screen.getByRole("button", { name: "Skip — dismiss without a reason" }));

    expect(await screen.findByText(DISCOVER_ACTION_MESSAGES.alreadyApplied)).toBeInTheDocument();
    expect(screen.queryByText("Dismissed.")).toBeNull();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip — dismiss without a reason" })).toBeNull();
    await release("list");
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(actions).toEqual(["dismiss"]);
  });

  it("Save on a stale card says it's already in Applications, and the card goes", async () => {
    renderInbox();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    applied = true;

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(DISCOVER_ACTION_MESSAGES.alreadyApplied)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(actions).toEqual(["save"]);
  });

  it("keeps Save and Dismiss off while Apply is in flight, and gone once it succeeds, before the card leaves", async () => {
    renderInbox();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    holding.add("promote");

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Dismiss this posting" })).toBeDisabled());
    expect(screen.getByTestId("save-button")).toBeDisabled();

    // Hold the refetch Apply triggers, so the card is still on screen after Apply succeeds.
    holding.add("list");
    await release("promote");

    expect(await screen.findByText(DISCOVER_ACTION_MESSAGES.promoted)).toBeInTheDocument();
    // The toast can show a render before the card sees the mutation succeed.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Dismiss this posting" })).toBeNull());
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByTestId("save-button")).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    await release("list");
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(actions).toEqual(["promote"]);
  });

  it("keeps Apply off while Save is in flight", async () => {
    renderInbox();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    holding.add("save");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Dismiss this posting" })).toBeDisabled();

    await release("save");
    expect(await screen.findByText(DISCOVER_ACTION_MESSAGES.saved)).toBeInTheDocument();
    expect(actions).toEqual(["save"]);
  });
});
