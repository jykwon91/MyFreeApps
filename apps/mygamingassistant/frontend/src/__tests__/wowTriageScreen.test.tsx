/**
 * The triage screen (/wow-forever/triage) with the shared API client mocked: signed out → /login with
 * the triage URL kept, a 401 mid-session does the same, a non-operator account is told so, Sign out sends
 * a pending write first; the frame guard (iframe / Discord Activity), Approve with undo, the merge
 * confirmation, the status menu's next states, and untrusted player text rendering only as text.
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDiscordLaunchForTests } from "@platform/ui/discord-activity/launchParams";
import TriageStatusMenu from "@/games/wow-forever/components/featureRequests/triage/TriageStatusMenu";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import WowTriagePage from "@/games/wow-forever/pages/WowTriagePage";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import { signOut } from "@/lib/auth";
import { store } from "@/lib/store";
import {
  axiosFailure,
  axiosOk,
  dropSession,
  inbox,
  inboxItem,
  signInOperator,
  stubMatchMedia,
  triageStory,
} from "./wowTriageFixtures";

const UNDO_MS = vi.hoisted(() => 300);
const requestMock = vi.hoisted(() => vi.fn<(config: AxiosRequestConfig) => Promise<unknown>>());

vi.mock("@/games/wow-forever/data/featureRequests/triage/triageConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/games/wow-forever/data/featureRequests/triage/triageConfig")>()),
  TRIAGE_UNDO_MS: UNDO_MS,
}));
vi.mock("@/lib/api", () => ({ default: { request: requestMock } }));

const BASE = "/wow/feature-requests/triage";
const LOGIN_TEST_ID = "login-page";

interface Server {
  inboxItems: TriageInboxItem[];
  stories: TriageStory[];
  /** Answer GET /inbox with this status instead (401 = the session expired, 403 = not the operator). */
  inboxStatus: number;
}

let server: Server;

function calls(method: string, pathPart: string): AxiosRequestConfig[] {
  return requestMock.mock.calls
    .map(([config]) => config)
    .filter((config) => (config.method ?? "GET") === method && String(config.url).includes(pathPart));
}

function ifMatchOf(config: AxiosRequestConfig | undefined): string | undefined {
  return (config?.headers as Record<string, string> | undefined)?.["If-Match"];
}

function route(config: AxiosRequestConfig): Promise<unknown> {
  const method = config.method ?? "GET";
  const path = String(config.url).replace(BASE, "");
  const body = config.data as Record<string, unknown> | undefined;
  if (method === "GET" && path === "/inbox") {
    if (server.inboxStatus === 401) {
      // What the shared client's 401 interceptor does: the session is gone.
      dropSession();
      return Promise.reject(axiosFailure(401, { detail: "Unauthorized" }));
    }
    if (server.inboxStatus !== 200) return Promise.reject(axiosFailure(server.inboxStatus, { detail: "Forbidden" }));
    return Promise.resolve(axiosOk(inbox(server.inboxItems)));
  }
  if (method === "GET" && path === "/stories") return Promise.resolve(axiosOk({ items: server.stories }));
  if (method === "PATCH" && path.startsWith("/stories/")) {
    const id = path.split("/")[2];
    const story = server.stories.find((s) => s.id === id) ?? server.inboxItems.find((i) => i.story?.id === id)?.story;
    return Promise.resolve(axiosOk({ ...story, ...body, updated_at: "2026-11-06T00:00:00.000001+00:00" }));
  }
  if (method === "POST" && path.endsWith("/merge")) return Promise.resolve(axiosOk({ merged_story_id: "x", into_story_id: "y" }));
  if (method === "POST" && path === "/submissions/mark-triaged") {
    const ids = body?.submission_ids as string[];
    server.inboxItems = server.inboxItems.filter((i) => !ids.includes(i.submission_id));
    return Promise.resolve(axiosOk({ updated: ids.length }));
  }
  return Promise.reject(axiosFailure(500, { detail: `unexpected ${method} ${path}` }));
}

/** Stands in for /login: shows where Login would send the operator back to. */
function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "";
  return <p data-testid={LOGIN_TEST_ID}>{from}</p>;
}

function renderPage(entry = "/wow-forever/triage") {
  const router = createMemoryRouter(
    [
      { path: "/wow-forever/triage", element: <WowTriagePage /> },
      { path: "/login", element: <LoginStub /> },
    ],
    { initialEntries: [entry] },
  );
  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

beforeEach(() => {
  stubMatchMedia(false);
  server = { inboxItems: [], stories: [], inboxStatus: 200 };
  requestMock.mockReset();
  requestMock.mockImplementation(route);
  signInOperator();
});

afterEach(() => {
  cleanup();
  signOut();
  dropSession();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  __resetDiscordLaunchForTests();
});

describe("session", () => {
  it("sends a signed-out visitor to sign in, keeping the triage URL, and calls nothing", async () => {
    dropSession();
    renderPage("/wow-forever/triage?tab=all&status=open");
    expect(await screen.findByTestId(LOGIN_TEST_ID)).toHaveTextContent("/wow-forever/triage?tab=all&status=open");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("opens the inbox when the operator is signed in", async () => {
    server.inboxItems = [inboxItem(1, triageStory(1, { status: "submitted", title: "Herb map" }))];
    renderPage();
    expect(await screen.findByText("1 idea waiting for you")).toBeInTheDocument();
    expect(screen.getByText("Herb map")).toBeInTheDocument();
  });

  it("goes back to sign in on a 401 mid-session, keeping the place", async () => {
    server.inboxStatus = 401;
    renderPage("/wow-forever/triage?tab=inbox");
    expect(await screen.findByTestId(LOGIN_TEST_ID)).toHaveTextContent("/wow-forever/triage?tab=inbox");
  });

  it("tells a signed-in account that isn't the operator so, with Sign out still there", async () => {
    server.inboxStatus = 403;
    renderPage();
    expect(await screen.findByTestId("triage-not-operator")).toHaveTextContent("This account can't triage requests.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("Sign out sends a pending approve first, then signs out", async () => {
    const story = triageStory(1, { status: "submitted", title: "Herb map" });
    server.inboxItems = [inboxItem(1, story)];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(calls("PATCH", "/stories/")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByTestId(LOGIN_TEST_ID)).toBeInTheDocument();
    expect(calls("PATCH", "/stories/")).toHaveLength(1);
    expect(calls("POST", "/mark-triaged")).toHaveLength(1);
    expect(window.localStorage.getItem("token")).toBeNull();
  });
});

describe("frame guard", () => {
  it("refuses inside an iframe", () => {
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    renderPage();
    expect(screen.getByTestId("triage-frame-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("triage-workspace")).not.toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("refuses inside the Discord Activity", () => {
    window.history.replaceState(null, "", "/wow-forever/triage?frame_id=abc&instance_id=1&platform=desktop");
    __resetDiscordLaunchForTests();
    renderPage();
    expect(screen.getByTestId("triage-frame-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("triage-workspace")).not.toBeInTheDocument();
  });
});

describe("approve with undo", () => {
  it("makes no call before the timer, undo cancels, and a second approve is sent", async () => {
    const story = triageStory(1, { status: "submitted", title: "Herb map" });
    server.inboxItems = [inboxItem(1, story)];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    const undoBar = screen.getByTestId("triage-undo-bar");
    expect(undoBar).toHaveTextContent("Herb map");
    expect(calls("PATCH", "/stories/")).toHaveLength(0);

    await user.click(within(undoBar).getByRole("button", { name: "Undo" }));
    await act(() => new Promise((r) => setTimeout(r, UNDO_MS * 2)));
    expect(calls("PATCH", "/stories/")).toHaveLength(0);
    expect(calls("POST", "/mark-triaged")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls("POST", "/mark-triaged")).toHaveLength(1));
    const [patch] = calls("PATCH", "/stories/");
    expect(patch?.data).toEqual({ status: "open" });
    expect(ifMatchOf(patch)).toBe(story.updated_at);
    expect(await screen.findByTestId("triage-empty-inbox")).toBeInTheDocument();
  });
});

describe("merge", () => {
  it("asks before merging, then merges and clears the submission", async () => {
    const source = triageStory(1, { status: "submitted", title: "Herb spawn map", i_want: "a map of herb spawns", area: "map_travel" });
    const target = triageStory(2, { title: "Herb spawns on the map", i_want: "herb spawn spots", area: "map_travel", vote_count: 4 });
    server.inboxItems = [inboxItem(1, source)];
    server.stories = [source, target, triageStory(3, { title: "Raid signups", i_want: "discord raid signups" })];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Merge…" }));

    const dialog = await screen.findByRole("dialog");
    const suggestions = await within(dialog).findByRole("heading", { name: "Maybe the same as…" });
    await user.click(within(suggestions.parentElement as HTMLElement).getByRole("button", { name: /Herb spawns on the map/ }));
    expect(screen.getByTestId("triage-merge-confirm")).toHaveTextContent(
      "Merge into 'Herb spawns on the map'? Its 1 vote moves too. This can't be undone.",
    );
    expect(calls("POST", "/merge")).toHaveLength(0);

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(calls("POST", "/mark-triaged")).toHaveLength(1));
    const [merge] = calls("POST", "/merge");
    expect(merge?.url).toBe(`${BASE}/stories/${source.id}/merge`);
    expect(merge?.data).toEqual({ into_story_id: target.id });
    expect(ifMatchOf(merge)).toBe(source.updated_at);
  });
});

describe("status menu", () => {
  async function options(status: TriageStory["status"]): Promise<string[]> {
    const user = userEvent.setup();
    const { unmount } = render(<TriageStatusMenu status={status} onPick={() => undefined} />);
    const toggle = screen.queryByRole("button", { name: "Change status" });
    if (toggle === null) {
      unmount();
      return [];
    }
    await user.click(toggle);
    const names = within(screen.getByRole("list", { name: "Change status" }))
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    unmount();
    return names;
  }

  it("offers only the valid next states", async () => {
    expect(await options("open")).toEqual(["Planned", "In progress", "Not planned…"]);
    expect(await options("planned")).toEqual(["In progress", "Open", "Not planned…"]);
    expect(await options("in_progress")).toEqual(["Shipped…", "Planned", "Not planned…"]);
    expect(await options("shipped")).toEqual(["Reopen"]);
    expect(await options("not_planned")).toEqual(["Reopen"]);
    expect(await options("submitted")).toEqual([]);
    expect(await options("duplicate")).toEqual([]);
  });

  it("hands the picked option back", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<TriageStatusMenu status="in_progress" onPick={onPick} />);
    await user.click(screen.getByRole("button", { name: "Change status" }));
    await user.click(screen.getByRole("button", { name: "Shipped…" }));
    expect(onPick).toHaveBeenCalledWith({ status: "shipped", label: "Shipped…", sheet: "shipped" });
  });
});

describe("untrusted text", () => {
  it.each([
    ["a script tag", "<script>window.__pwned = 1</script>", "script"],
    ["an img onerror", '<img src=x onerror="window.__pwned = 1">', "img"],
    ["a link", '<a href="javascript:alert(1)">click</a>', "a"],
  ])("renders %s literally, with no element created", (_name, payload, tag) => {
    const { container } = render(<TriageSubmissionQuote label="Player wrote — untrusted" text={payload} />);
    expect(container.querySelector(tag)).toBeNull();
    expect(container.querySelector("blockquote")).toHaveTextContent(payload);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("shows a bidi override as a visible marker with a badge", () => {
    const { container } = render(<TriageSubmissionQuote label="Player wrote — untrusted" text={"safe‮exe.txt"} />);
    expect(screen.getByText("hidden characters")).toBeInTheDocument();
    expect(screen.getByText("⟨U+202E⟩")).toBeInTheDocument();
    expect(container.querySelector("blockquote")?.textContent).not.toContain("‮");
    expect(container.querySelector("bdi")).not.toBeNull();
  });

  it("says when retention deleted the words", () => {
    render(<TriageSubmissionQuote label="Player wrote — untrusted" text={null} />);
    expect(screen.getByText("The player's own words have been deleted.")).toBeInTheDocument();
  });
});
