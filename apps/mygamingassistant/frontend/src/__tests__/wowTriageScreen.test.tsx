/**
 * The triage screen (/wow-forever/triage) with a mocked `fetch`: unlock (wrong key, 429 countdown), the
 * frame guard (iframe / Discord Activity), Approve with undo, the merge confirmation, the status menu's
 * next states, and untrusted player text rendering only as text.
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDiscordLaunchForTests } from "@platform/ui/discord-activity/launchParams";
import TriageStatusMenu from "@/games/wow-forever/components/featureRequests/triage/TriageStatusMenu";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import { lockTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import { clearTriageData } from "@/games/wow-forever/lib/featureRequests/triage/triageStore";
import WowTriagePage from "@/games/wow-forever/pages/WowTriagePage";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import { TRIAGE_KEY, inbox, inboxItem, jsonResponse, stubMatchMedia, triageStory } from "./wowTriageFixtures";

const UNDO_MS = vi.hoisted(() => 300);

vi.mock("@/games/wow-forever/data/featureRequests/triage/triageConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/games/wow-forever/data/featureRequests/triage/triageConfig")>()),
  TRIAGE_UNDO_MS: UNDO_MS,
}));

const BASE = "/api/wow/feature-requests/triage";
const fetchMock = vi.fn<typeof fetch>();

interface Server {
  inboxItems: TriageInboxItem[];
  stories: TriageStory[];
  /** Answer GET /inbox with this status instead (e.g. 404 = wrong key). */
  inboxStatus: number;
  inboxHeaders: Record<string, string>;
}

let server: Server;

function calls(method: string, pathPart: string) {
  return fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? "GET") === method && String(url).includes(pathPart));
}

function route(url: string, init: RequestInit | undefined): Response {
  const method = init?.method ?? "GET";
  const path = url.replace(BASE, "");
  if (method === "GET" && path === "/inbox") {
    if (server.inboxStatus !== 200) return jsonResponse(server.inboxStatus, { detail: "Not Found" }, server.inboxHeaders);
    return jsonResponse(200, inbox(server.inboxItems));
  }
  if (method === "GET" && path === "/stories") return jsonResponse(200, { items: server.stories });
  if (method === "PATCH" && path.startsWith("/stories/")) {
    const id = path.split("/")[2];
    const story = server.stories.find((s) => s.id === id) ?? server.inboxItems.find((i) => i.story?.id === id)?.story;
    return jsonResponse(200, { ...story, ...JSON.parse(String(init?.body)), updated_at: "2026-11-06T00:00:00.000001+00:00" });
  }
  if (method === "POST" && path.endsWith("/merge")) return jsonResponse(200, { merged_story_id: "x", into_story_id: "y" });
  if (method === "POST" && path === "/submissions/mark-triaged") {
    const ids: string[] = JSON.parse(String(init?.body)).submission_ids;
    server.inboxItems = server.inboxItems.filter((i) => !ids.includes(i.submission_id));
    return jsonResponse(200, { updated: ids.length });
  }
  return jsonResponse(500, { detail: `unexpected ${method} ${path}` });
}

function renderPage(entry = "/wow-forever/triage") {
  const router = createMemoryRouter([{ path: "/wow-forever/triage", element: <WowTriagePage /> }], { initialEntries: [entry] });
  return render(<RouterProvider router={router} />);
}

async function unlock(user: ReturnType<typeof userEvent.setup>, key = TRIAGE_KEY) {
  await user.type(screen.getByLabelText("Triage key"), key);
  await user.click(screen.getByRole("button", { name: "Unlock" }));
}

beforeEach(() => {
  stubMatchMedia(false);
  server = { inboxItems: [], stories: [], inboxStatus: 200, inboxHeaders: {} };
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => Promise.resolve(route(String(input), init)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  lockTriage("manual");
  clearTriageData();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  __resetDiscordLaunchForTests();
});

describe("unlock", () => {
  it("says the key didn't work on a 404 and stays locked", async () => {
    server.inboxStatus = 404;
    const user = userEvent.setup();
    renderPage();
    await unlock(user, "wrong-key");
    expect(await screen.findByRole("alert")).toHaveTextContent("That key didn't work. Check you copied all of it.");
    expect(screen.getByLabelText("Triage key")).toBeInTheDocument();
    expect(screen.queryByTestId("triage-workspace")).not.toBeInTheDocument();
  });

  it("counts down a 429 and keeps Unlock off meanwhile", async () => {
    server.inboxStatus = 429;
    server.inboxHeaders = { "Retry-After": "30" };
    const user = userEvent.setup();
    renderPage();
    await unlock(user);
    expect(await screen.findByText("Too many tries. Wait 30 seconds.")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("the key input is never named, so a form post can't carry it", () => {
    renderPage();
    const input = screen.getByLabelText("Triage key");
    expect(input).not.toHaveAttribute("name");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });

  it("opens the inbox with the right key", async () => {
    server.inboxItems = [inboxItem(1, triageStory(1, { status: "submitted", title: "Herb map" }))];
    const user = userEvent.setup();
    renderPage();
    await unlock(user);
    expect(await screen.findByText("1 idea waiting for you")).toBeInTheDocument();
    expect(screen.getByText("Herb map")).toBeInTheDocument();
  });
});

describe("frame guard", () => {
  it("refuses inside an iframe", () => {
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    renderPage();
    expect(screen.getByTestId("triage-frame-notice")).toBeInTheDocument();
    expect(screen.queryByLabelText("Triage key")).not.toBeInTheDocument();
  });

  it("refuses inside the Discord Activity", () => {
    window.history.replaceState(null, "", "/wow-forever/triage?frame_id=abc&instance_id=1&platform=desktop");
    __resetDiscordLaunchForTests();
    renderPage();
    expect(screen.getByTestId("triage-frame-notice")).toBeInTheDocument();
    expect(screen.queryByLabelText("Triage key")).not.toBeInTheDocument();
  });
});

describe("approve with undo", () => {
  it("makes no call before the timer, undo cancels, and a second approve is sent", async () => {
    const story = triageStory(1, { status: "submitted", title: "Herb map" });
    server.inboxItems = [inboxItem(1, story)];
    const user = userEvent.setup();
    renderPage();
    await unlock(user);
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
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: "open" });
    expect((patch?.[1]?.headers as Record<string, string>)["If-Match"]).toBe(story.updated_at);
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
    await unlock(user);
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
    expect(String(merge?.[0])).toBe(`${BASE}/stories/${source.id}/merge`);
    expect(JSON.parse(String(merge?.[1]?.body))).toEqual({ into_story_id: target.id });
    expect((merge?.[1]?.headers as Record<string, string>)["If-Match"]).toBe(source.updated_at);
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
