import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WowRaidPage from "@/games/wow-forever/pages/WowRaidPage";
import { DISPLAY_ROLE, LIST_STATUS, RAID_STATE, SEGMENT_KIND, TIME_STYLE } from "@/games/wow-forever/data/raidPage";
import {
  NOT_FOUND_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SERVER_PROBLEM_MESSAGE,
} from "@/games/wow-forever/lib/raidPageError";
import { formatDiscordTime } from "@/games/wow-forever/lib/raidTime";
import type { RaidEntry, RaidPage } from "@/games/wow-forever/types/raid";

const mockQuery = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/games/wow-forever/api/wowRaidsApi", () => ({
  useGetRaidPageQuery: (...args: unknown[]) => mockQuery(...args),
}));

const WEB_ID = "6f1c2b0e9d8a4c7b8e5f3a2d1c0b9a87";
const DISCORD_URL = "https://discord.com/channels/1/2/3";
const PULL_UNIX = 1_791_576_000;
const PULL_ISO = "2026-10-09T20:00:00.000Z";
const TITLE = "Friday Molten Core";
const SITE_TITLE = "MyGamingAssistant";
const NOT_FOUND = { status: 404, data: { detail: "raid_not_found" } };

function entry(fields: Partial<RaidEntry> & Pick<RaidEntry, "id" | "name">): RaidEntry {
  return {
    number: null,
    wow_class: null,
    spec: null,
    icon: null,
    role_group: null,
    late: false,
    queued: false,
    ...fields,
  };
}

function raid(fields: Partial<RaidPage> = {}): RaidPage {
  return {
    web_id: WEB_ID,
    title: TITLE,
    raid_key: "mc",
    raid_name: "Molten Core",
    leader_name: "Aldren",
    starts_at: PULL_ISO,
    closes_at: "2026-10-09T18:00:00.000Z",
    state: RAID_STATE.OPEN,
    cancel_reason: null,
    size_cap: 40,
    seats_taken: 14,
    late: 2,
    queued: 3,
    color: "#e67e22",
    banner_url: "/api/discord/raid-banners/mc.png?v=1",
    discord_url: DISCORD_URL,
    description: [
      { kind: SEGMENT_KIND.TEXT, text: "Bring fire resistance. Pull at " },
      { kind: SEGMENT_KIND.TIME, unix: PULL_UNIX, style: TIME_STYLE.SHORT_TIME },
      { kind: SEGMENT_KIND.TEXT, text: ", questions to " },
      { kind: SEGMENT_KIND.MENTION, text: "@Raid Leads" },
    ],
    roles: [
      { role: DISPLAY_ROLE.TANK, label: "Tanks", icon: "role_tank", count: 2, limit: 2 },
      { role: DISPLAY_ROLE.MELEE, label: "Melee", icon: "role_melee", count: 6, limit: null },
      { role: DISPLAY_ROLE.RANGED, label: "Ranged", icon: "role_ranged", count: 4, limit: null },
      { role: DISPLAY_ROLE.HEALER, label: "Healers", icon: "role_healer", count: 2, limit: null },
    ],
    columns: [
      {
        key: "tank",
        label: "Tanks",
        icon: "role_tank",
        count: 1,
        limit: 2,
        entries: [
          entry({
            id: "s1",
            number: 1,
            name: "Brannoc",
            wow_class: "warrior",
            spec: "Protection Warrior",
            icon: "warrior_protection",
            role_group: DISPLAY_ROLE.TANK,
          }),
        ],
      },
      {
        key: "warrior",
        label: "Warrior",
        icon: "warrior",
        count: 2,
        limit: null,
        entries: [
          entry({
            id: "s2",
            number: 2,
            name: "Dorn",
            wow_class: "warrior",
            spec: "Fury Warrior",
            icon: "warrior_fury",
            role_group: DISPLAY_ROLE.MELEE,
            late: true,
          }),
          entry({ id: "s3", number: 15, name: "Torvald", wow_class: "warrior", icon: "warrior", queued: true }),
        ],
      },
      {
        key: "none",
        label: "No class yet",
        icon: null,
        count: 1,
        limit: null,
        entries: [entry({ id: "s4", number: 16, name: "Newcomer", queued: true })],
      },
    ],
    lists: [
      {
        status: LIST_STATUS.TENTATIVE,
        label: "Tentative",
        icon: "status_tentative",
        entries: [entry({ id: "s5", name: "Mabel" })],
      },
      { status: LIST_STATUS.BENCH, label: "Bench", icon: "status_bench", entries: [entry({ id: "s6", name: "Pell" })] },
    ],
    icons_version: "v1",
    ...fields,
  };
}

interface QueryState {
  currentData?: RaidPage;
  error?: unknown;
  isFetching?: boolean;
  fulfilledTimeStamp?: number;
}

function setQuery(state: QueryState): void {
  mockQuery.mockReturnValue({ isFetching: false, refetch: mockRefetch, ...state });
}

function showRaid(fields: Partial<RaidPage> = {}): void {
  setQuery({ currentData: raid(fields), fulfilledTimeStamp: Date.now() });
}

function tree() {
  return (
    <MemoryRouter initialEntries={[`/wow-forever/raids/${WEB_ID}`]}>
      <Routes>
        <Route path="/wow-forever/raids/:webId" element={<WowRaidPage />} />
        <Route path="/wow-forever" element={<p>WoW Forever home</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(tree());
}

function textsOf(elements: HTMLElement[]): (string | null)[] {
  return elements.map((element) => element.textContent);
}

describe("raid web page", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockRefetch.mockReset();
    document.title = SITE_TITLE;
  });

  it("reads the raid by its link's id, re-reading every minute while in view", () => {
    showRaid();
    renderPage();
    expect(mockQuery).toHaveBeenCalledWith(WEB_ID, { pollingInterval: 60_000, skipPollingIfUnfocused: true });
  });

  it("shows the page's shape while it loads, with no loading text, then the raid", () => {
    setQuery({ isFetching: true });
    const view = renderPage();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();

    showRaid();
    view.rerender(tree());
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-busy");
  });

  it("shows the raid as its Discord post does", () => {
    showRaid();
    renderPage();
    expect(document.title).toBe(`${TITLE} · ${SITE_TITLE}`);
    expect(screen.getByText("Molten Core · Leader: Aldren")).toBeInTheDocument();
    expect(screen.getByText("14/40 confirmed (2 late) · 3 in queue")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Sign-ups close")).toBeInTheDocument();
    const discord = screen.getByRole("link", { name: "Open in Discord (opens in a new tab)" });
    expect(discord).toHaveAttribute("href", DISCORD_URL);
    expect(discord).toHaveAttribute("target", "_blank");

    const roles = within(screen.getByRole("list", { name: "Roles" })).getAllByRole("listitem");
    expect(textsOf(roles)).toEqual(["Tanks2/2", "Melee6", "Ranged4", "Healers2"]);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(textsOf(headings)).toEqual(["Tanks1/2", "Warrior2", "No class yet1", "Tentative1", "Bench1"]);
    expect(screen.getByRole("heading", { level: 2, name: "Tentative · Bench" })).toBeInTheDocument();
  });

  it("numbers the line, marks late and queued players, and names each icon", () => {
    showRaid();
    renderPage();
    const warriors = screen.getByRole("list", { name: /^Warrior/ });
    expect(warriors.tagName).toBe("OL");
    const [dorn, torvald] = within(warriors).getAllByRole("listitem");
    expect(within(dorn).getByText("2")).toBeInTheDocument();
    expect(within(dorn).getByText("late")).toHaveClass("sr-only");
    expect(within(dorn).getByRole("img", { name: "Fury Warrior" })).toHaveAttribute(
      "src",
      "/api/discord/raid-icons/warrior_fury.png?v=v1",
    );
    expect(within(torvald).getByRole("img", { name: "Warrior" })).toBeInTheDocument();
    expect(within(torvald).getByText("Torvald")).toHaveClass("line-through");
    expect(within(torvald).getByText("queued")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /^Tentative/ }).tagName).toBe("UL");
  });

  it("shows the description's mentions without ids, and its times in the viewer's zone", () => {
    showRaid();
    renderPage();
    const about = screen.getByRole("region", { name: "About this raid" });
    expect(within(about).getByText("@Raid Leads")).toBeInTheDocument();
    const time = about.querySelector("time");
    expect(time).toHaveAttribute("datetime", PULL_ISO);
    expect(time).toHaveTextContent(formatDiscordTime(PULL_UNIX, TIME_STYLE.SHORT_TIME, Date.now()));
    expect(about.textContent).not.toContain("<t:");
  });

  it.each([404, 422])("says so when the link leads to no raid (%d), with the way back", async (status) => {
    const user = userEvent.setup();
    setQuery({ error: { status, data: { detail: "raid_not_found" } } });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Raid not found" })).toBeInTheDocument();
    expect(screen.getByText(NOT_FOUND_MESSAGE)).toBeInTheDocument();
    expect(document.title).toBe(`Raid not found · ${SITE_TITLE}`);

    await user.click(screen.getByRole("link", { name: "Go to WoW Forever" }));
    expect(screen.getByText("WoW Forever home")).toBeInTheDocument();
    expect(document.title).toBe(SITE_TITLE);
  });

  it("shows a raid deleted since the last read as not found", () => {
    setQuery({ currentData: raid(), error: NOT_FOUND, fulfilledTimeStamp: Date.now() });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Raid not found" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: TITLE })).not.toBeInTheDocument();
  });

  it("says when there were too many requests, and Retry re-reads, spinning while it does", async () => {
    const user = userEvent.setup();
    const tooMany = { status: 429, data: { detail: "rate_limited" } };
    setQuery({ error: tooMany });
    const view = renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(RATE_LIMITED_MESSAGE);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    setQuery({ error: tooMany, isFetching: true });
    view.rerender(tree());
    expect(screen.getByRole("button", { name: "Retrying" })).toBeDisabled();
  });

  it.each([
    [{ status: 500, data: "<html>Bad gateway</html>" }, SERVER_PROBLEM_MESSAGE],
    [{ status: undefined, data: "Network Error" }, "Network Error"],
    [{ status: 400, data: { detail: "Something specific" } }, "Something specific"],
  ])("explains a failed read in plain words (%o)", (error, message) => {
    setQuery({ error });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Couldn't load this raid" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("points to the post in Discord while nobody has signed up", () => {
    showRaid({ columns: [], lists: [], seats_taken: 0, late: 0, queued: 0 });
    renderPage();
    expect(screen.getByText("No sign-ups yet — sign up from the raid's post in Discord.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Open in Discord/ })).toHaveLength(2);
    expect(screen.getByText("0/40 confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: /Tentative/ })).not.toBeInTheDocument();
  });

  it("offers no Discord link once the post is gone", () => {
    showRaid({ discord_url: null, columns: [] });
    renderPage();
    expect(screen.queryByRole("link", { name: /^Open in Discord/ })).not.toBeInTheDocument();
  });

  it("shows a cancelled raid with its reason, its time struck through, and no banner", () => {
    showRaid({
      state: RAID_STATE.CANCELLED,
      cancel_reason: "Not enough healers",
      banner_url: null,
      closes_at: null,
      color: "#95a5a6",
    });
    const { container } = renderPage();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Not enough healers")).toBeInTheDocument();
    expect(container.querySelector(`time[datetime="${PULL_ISO}"]`)).toHaveClass("line-through");
    expect(container.querySelector('img[src*="raid-banners"]')).toBeNull();
    expect(screen.queryByText("Sign-ups close")).not.toBeInTheDocument();
  });

  it("re-reads on Refresh, which can't be pressed while a read is under way", async () => {
    const user = userEvent.setup();
    setQuery({ currentData: raid(), fulfilledTimeStamp: Date.now(), isFetching: true });
    const view = renderPage();
    const busy = screen.getByRole("button", { name: "Refresh" });
    expect(busy).toBeDisabled();
    expect(busy.querySelector("svg")).toHaveClass("animate-spin");

    showRaid();
    view.rerender(tree());
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
  });

  it("keeps the raid on screen when a re-read fails, and says so", () => {
    setQuery({
      currentData: raid(),
      fulfilledTimeStamp: Date.now() - 5 * 60_000,
      error: { status: 500, data: "" },
    });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`Couldn't refresh: ${SERVER_PROBLEM_MESSAGE}`);
    expect(screen.getByText("Updated 5 minutes ago")).toBeInTheDocument();
  });

  it("asks search engines to skip it, and gives the tab back its title when it goes", () => {
    showRaid();
    const view = renderPage();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    view.unmount();
    expect(document.title).toBe(SITE_TITLE);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
