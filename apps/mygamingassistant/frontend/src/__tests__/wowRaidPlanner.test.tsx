import { skipToken } from "@reduxjs/toolkit/query/react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAID_STATE, SITE_NAME } from "@/games/wow-forever/data/raidPage";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import { SERVER_PROBLEM_MESSAGE } from "@/games/wow-forever/lib/raidPageError";
import type { RaidPlan } from "@/games/wow-forever/types/raidPlan";
import {
  JORY_NOTE,
  PLANNER_PATH,
  STORAGE_KEY,
  TITLE,
  TOKEN,
  WEB_ID,
  expiringIn,
  plan,
} from "@/test/raidPlanFixtures";
import { renderPlanner, seatsIn, unplacedNames } from "@/test/renderRaidPlanner";

const mockPlanQuery = vi.fn();
const mockRefetch = vi.fn();
const mockSave = vi.fn();

vi.mock("@/games/wow-forever/api/wowRaidsApi", () => ({
  useGetRaidPlanQuery: (...args: unknown[]) => mockPlanQuery(...args),
  useSaveRaidPlanMutation: () => [mockSave, { isLoading: false }],
}));

/** A raid this tab holds no token for. */
const OTHER_WEB_ID = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const MINUTE_MS = 60_000;

interface QueryState {
  currentData?: RaidPlan;
  error?: unknown;
  isFetching?: boolean;
}

function setQuery(state: QueryState): void {
  mockPlanQuery.mockReturnValue({ isFetching: false, refetch: mockRefetch, ...state });
}

function showPlan(fields: Partial<RaidPlan> = {}): void {
  setQuery({ currentData: plan(fields) });
}

describe("the group planner: reading", () => {
  beforeEach(() => {
    mockPlanQuery.mockReset();
    mockRefetch.mockReset();
    mockSave.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem(STORAGE_KEY, TOKEN);
    window.history.replaceState(null, "", "/");
    document.title = SITE_NAME;
  });

  it("reads the plan with the link's token, and takes the token out of the address bar", () => {
    sessionStorage.clear();
    window.history.replaceState(null, "", `${PLANNER_PATH}#k=${TOKEN}`);
    showPlan();
    renderPlanner();
    expect(mockPlanQuery).toHaveBeenCalledWith({ webId: WEB_ID, token: TOKEN });
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe(PLANNER_PATH);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
  });

  it("without a token for the raid, says how to get a link, and reads nothing", () => {
    showPlan();
    renderPlanner(`/wow-forever/raids/${OTHER_WEB_ID}/plan`);
    expect(mockPlanQuery).toHaveBeenCalledWith(skipToken);
    expect(screen.getByRole("heading", { level: 1, name: "Planner link missing or expired" })).toBeInTheDocument();
    expect(screen.getByText(PLANNER_MESSAGE.LINK_PROBLEM)).toBeInTheDocument();
    expect(document.title).toBe(`Planner link missing or expired · ${SITE_NAME}`);
  });

  it("shows the planner's shape while the plan loads, with no loading text", () => {
    setQuery({ isFetching: true });
    renderPlanner();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("shows the groups — each with its roles — and who is in none, in line order", () => {
    showPlan();
    renderPlanner();
    expect(document.title).toBe(`Groups — ${TITLE} · ${SITE_NAME}`);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    expect(screen.getByRole("heading", { level: 1, name: `Groups — ${TITLE}` })).toBeInTheDocument();
    expect(screen.getByText(/10-man \(2 groups\)$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Raid page (opens in a new tab)" })).toHaveAttribute(
      "href",
      `/wow-forever/raids/${WEB_ID}`,
    );

    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
    expect(seatsIn("Group 2")).toEqual(["Edda", "Gwyn", "", "", ""]);
    expect(unplacedNames()).toEqual(["Dara", "Fenn", "Hale", "Isla", "Jory"]);
    const groupOne = screen.getByRole("region", { name: "Group 1" });
    expect(within(groupOne).getByText("3/5")).toBeInTheDocument();
    expect(within(groupOne).getByText("T1 H1 M1 R0")).toBeInTheDocument();
    expect(within(groupOne).getByText("1 tank, 1 healer, 1 melee, 0 ranged")).toHaveClass("sr-only");
    expect(within(groupOne).getAllByText("Empty")).toHaveLength(2);
    const pool = screen.getByRole("region", { name: "Not in a group" });
    expect(within(pool).getByText("5")).toBeInTheDocument();
  });

  it("names each player's handle and icon, marks who is late, and opens a note under its player", async () => {
    const user = userEvent.setup();
    showPlan();
    renderPlanner();
    const aldren = screen.getByRole("button", { name: "Aldren, Protection Warrior" });
    expect(within(aldren).getByRole("img", { name: "Protection Warrior" })).toHaveAttribute(
      "src",
      "/api/discord/raid-icons/warrior_protection.png?v=v1",
    );
    const jory = screen.getByRole("button", { name: "Jory, Destruction Warlock, late" });
    expect(within(jory).getByText("late")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Isla" })).toBeInTheDocument();

    const note = screen.getByText(JORY_NOTE);
    expect(note).not.toBeVisible();
    const toggle = screen.getByRole("button", { name: "Note from Jory" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(note).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /^Note from/ })).toHaveLength(1);
  });

  it("counts down the link", () => {
    showPlan();
    renderPlanner();
    expect(screen.getByText("Link expires in 2 h").closest("p")).toHaveClass("text-muted-foreground");
  });

  it("warns in amber when the link is about to stop working", () => {
    showPlan({ link_expires_at: expiringIn(5 * MINUTE_MS + 30_000) });
    renderPlanner();
    expect(screen.getByText("Link expires in 5 m").closest("p")).toHaveClass("text-amber-700");
  });

  it.each([
    [{ status: 404, data: { detail: "raid_not_found" } }, "Raid not found"],
    [{ status: 403, data: { detail: "plan_link_expired" } }, "Planner link missing or expired"],
    [{ status: 403, data: { detail: "plan_link_invalid" } }, "Planner link missing or expired"],
  ])("says why when the read is refused (%o)", (error, heading) => {
    setQuery({ error });
    renderPlanner();
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("explains a failed read, and Retry reads again", async () => {
    const user = userEvent.setup();
    setQuery({ error: { status: 500, data: "" } });
    renderPlanner();
    expect(screen.getByRole("heading", { level: 1, name: "Couldn't load this raid" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(SERVER_PROBLEM_MESSAGE);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [RAID_STATE.CANCELLED, PLANNER_MESSAGE.CANCELLED],
    [RAID_STATE.COMPLETED, PLANNER_MESSAGE.OVER],
  ])("shows a %s raid's groups with no way to change them", (state, message) => {
    showPlan({ state });
    renderPlanner();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auto-fill" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Aldren/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    // Notes still open.
    expect(screen.getByRole("button", { name: "Note from Jory" })).toBeInTheDocument();
  });

  it("says when nobody has a seat yet, and can still reload", () => {
    showPlan({ players: [] });
    renderPlanner();
    expect(screen.getByText(PLANNER_MESSAGE.NOBODY_SEATED)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Group 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
