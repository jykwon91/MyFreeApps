import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import type { RaidPlan, RaidPlanSaved } from "@/games/wow-forever/types/raidPlan";
import {
  FIRST_SEATS,
  PLANNER_PATH,
  STORAGE_KEY,
  TOKEN,
  WEB_ID,
  idOf,
  plan,
  seated,
  theirPlan,
} from "@/test/raidPlanFixtures";
import { renderPlanner, seatsIn, unplacedNames } from "@/test/renderRaidPlanner";

const mockPlanQuery = vi.fn();
const mockRefetch = vi.fn();
const mockSave = vi.fn();
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
let mockSaving = false;

vi.mock("@/games/wow-forever/api/wowRaidsApi", () => ({
  useGetRaidPlanQuery: (...args: unknown[]) => mockPlanQuery(...args),
  useSaveRaidPlanMutation: () => [mockSave, { isLoading: mockSaving }],
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: (...args: unknown[]) => mockShowError(...args),
  showSuccess: (...args: unknown[]) => mockShowSuccess(...args),
}));

type User = ReturnType<typeof userEvent.setup>;

const COPIED_TEXT = "G1: Aldren, Brisa, Cael\nG2: Edda, Gwyn";
/** `FIRST_SEATS` with Fenn moved into Group 1's fourth seat. */
const FENN_SEATED = { ...FIRST_SEATS, Fenn: { group: 1, slot: 4 } };

function showPlan(fields: Partial<RaidPlan> = {}): void {
  mockPlanQuery.mockReturnValue({ currentData: plan(fields), isFetching: false, refetch: mockRefetch });
}

function rereadGives(next: RaidPlan): void {
  mockRefetch.mockReturnValue({ unwrap: () => Promise.resolve(next) });
}

function rereadFails(error: unknown): void {
  mockRefetch.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

function saveGives(saved: RaidPlanSaved): void {
  mockSave.mockReturnValue({ unwrap: () => Promise.resolve(saved) });
}

function saveRefused(error: unknown): void {
  mockSave.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

/** Moves `name` with their Move-to list: to a seat's id, or "pool". */
function moveTo(user: User, name: string, target: string): Promise<void> {
  return user.selectOptions(screen.getByRole("combobox", { name: `Move ${name} to` }), target);
}

function optionText(name: string, value: string): string | null | undefined {
  const select = screen.getByRole("combobox", { name: `Move ${name} to` });
  return select.querySelector(`option[value="${value}"]`)?.textContent;
}

async function moveFennAndSave(user: User): Promise<void> {
  await moveTo(user, "Fenn", "slot:1:4");
  await user.click(screen.getByRole("button", { name: "Save" }));
}

describe("the group planner: editing", () => {
  beforeEach(() => {
    mockPlanQuery.mockReset();
    mockRefetch.mockReset();
    mockSave.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockSaving = false;
    sessionStorage.clear();
    sessionStorage.setItem(STORAGE_KEY, TOKEN);
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves a player with their Move-to list: into an empty seat, onto someone to swap, or out", async () => {
    const user = userEvent.setup();
    showPlan();
    renderPlanner();
    expect(optionText("Fenn", "slot:1:1")).toBe("Slot 1 — swap with Aldren");
    expect(optionText("Fenn", "slot:2:3")).toBe("Slot 3 — empty");
    expect(optionText("Aldren", "slot:1:1")).toBe("Slot 1 — here");
    const fennOut = screen.getByRole("combobox", { name: "Move Fenn to" }).querySelector('option[value="pool"]');
    expect(fennOut).toBeDisabled();

    // From no group onto Aldren: Aldren leaves the groups.
    await moveTo(user, "Fenn", "slot:1:1");
    expect(seatsIn("Group 1")).toEqual(["Fenn", "Brisa", "Cael", "", ""]);
    expect(unplacedNames()).toEqual(["Aldren", "Dara", "Hale", "Isla", "Jory"]);
    // Seat for seat: Edda takes Brisa's.
    await moveTo(user, "Brisa", "slot:2:1");
    expect(seatsIn("Group 1")).toEqual(["Fenn", "Edda", "Cael", "", ""]);
    expect(seatsIn("Group 2")).toEqual(["Brisa", "Gwyn", "", "", ""]);
    await moveTo(user, "Cael", "pool");
    expect(seatsIn("Group 1")).toEqual(["Fenn", "Edda", "", "", ""]);
    expect(unplacedNames()).toEqual(["Aldren", "Cael", "Dara", "Hale", "Isla", "Jory"]);
    expect(screen.getByText(PLANNER_MESSAGE.UNSAVED)).toBeInTheDocument();
  });

  it("saves only once something changed, sends every placed player, and says it's done", async () => {
    const user = userEvent.setup();
    showPlan();
    saveGives({ plan: plan({ version: 4, players: seated(FENN_SEATED) }), dropped: [] });
    renderPlanner();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText(PLANNER_MESSAGE.UNSAVED)).not.toBeInTheDocument();

    await moveFennAndSave(user);
    expect(mockSave).toHaveBeenCalledWith({
      webId: WEB_ID,
      token: TOKEN,
      body: {
        version: 3,
        published: false,
        assignments: [
          { signup_id: idOf("Aldren"), group: 1, slot: 1 },
          { signup_id: idOf("Brisa"), group: 1, slot: 2 },
          { signup_id: idOf("Cael"), group: 1, slot: 3 },
          { signup_id: idOf("Fenn"), group: 1, slot: 4 },
          { signup_id: idOf("Edda"), group: 2, slot: 1 },
          { signup_id: idOf("Gwyn"), group: 2, slot: 2 },
        ],
      },
    });
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Groups saved"));
    expect(screen.queryByText(PLANNER_MESSAGE.UNSAVED)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);
  });

  it("says who a save took out for leaving their seat meanwhile", async () => {
    const user = userEvent.setup();
    showPlan();
    saveGives({ plan: plan({ version: 4, players: seated(FIRST_SEATS) }), dropped: [idOf("Fenn")] });
    renderPlanner();
    await moveFennAndSave(user);
    await waitFor(() =>
      expect(mockShowSuccess).toHaveBeenCalledWith("Groups saved — 1 player who left their seat was taken out."),
    );
  });

  it.each([
    [409, "groups_changed", PLANNER_MESSAGE.CHANGED],
    [422, "invalid_plan", PLANNER_MESSAGE.ROSTER_CHANGED],
  ])("a refused save (%d %s) says why and shows the groups as they are now", async (status, detail, message) => {
    const user = userEvent.setup();
    showPlan();
    saveRefused({ status, data: { detail } });
    rereadGives(theirPlan());
    renderPlanner();
    await moveFennAndSave(user);
    await waitFor(() => expect(seatsIn("Group 2")).toEqual(["Edda", "Gwyn", "Dara", "", ""]));
    expect(mockShowError).toHaveBeenCalledWith(message);
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
    expect(screen.queryByText(PLANNER_MESSAGE.UNSAVED)).not.toBeInTheDocument();
  });

  it("turns read-only when a save finds the raid over", async () => {
    const user = userEvent.setup();
    showPlan();
    saveRefused({ status: 409, data: { detail: "raid_over" } });
    rereadGives(plan());
    renderPlanner();
    await moveFennAndSave(user);
    expect(await screen.findByText(PLANNER_MESSAGE.OVER, { selector: "p" })).toBeInTheDocument();
    expect(mockShowError).toHaveBeenCalledWith(PLANNER_MESSAGE.OVER);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it.each([
    [{ status: 403, data: { detail: "plan_link_expired" } }, "Planner link missing or expired"],
    [{ status: 404, data: { detail: "raid_not_found" } }, "Raid not found"],
  ])("stops when a save is refused for good (%o)", async (error, heading) => {
    const user = userEvent.setup();
    showPlan();
    saveRefused(error);
    renderPlanner();
    await moveFennAndSave(user);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it("keeps the leader's changes when a save fails, to try again", async () => {
    const user = userEvent.setup();
    showPlan();
    saveRefused({ status: 500, data: "" });
    renderPlanner();
    await moveFennAndSave(user);
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(PLANNER_MESSAGE.SAVE_FAILED));
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);
    expect(screen.getByText(PLANNER_MESSAGE.UNSAVED)).toBeInTheDocument();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it("shares the groups with raiders from the next save", async () => {
    const user = userEvent.setup();
    showPlan();
    saveGives({ plan: plan({ version: 4, published: true }), dropped: [] });
    renderPlanner();
    const visible = screen.getByRole("switch", { name: "Visible to raiders" });
    expect(visible).toHaveAttribute("aria-checked", "false");
    expect(visible).toHaveAccessibleDescription(PLANNER_MESSAGE.PUBLISH_HINT);

    await user.click(visible);
    expect(visible).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(PLANNER_MESSAGE.UNSAVED)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    const published = expect.objectContaining({ published: true });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ body: published }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
    expect(screen.getByRole("switch", { name: "Visible to raiders" })).toHaveAttribute("aria-checked", "true");
  });

  it("auto-fills the empty seats by role, never moving anyone placed", async () => {
    const user = userEvent.setup();
    showPlan();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "Fenn", "Isla"]);
    expect(seatsIn("Group 2")).toEqual(["Edda", "Gwyn", "Dara", "Hale", "Jory"]);
    expect(screen.getByText(PLANNER_MESSAGE.EVERYONE_PLACED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
  });

  it("asks before clearing every group", async () => {
    const user = userEvent.setup();
    showPlan();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Clear groups" }));
    const dialog = screen.getByRole("dialog", { name: "Clear all groups?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);

    await user.click(screen.getByRole("button", { name: "Clear groups" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(seatsIn("Group 1")).toEqual(["", "", "", "", ""]);
    expect(unplacedNames()).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Clear groups" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy as text" })).toBeDisabled();
  });

  it("copies the groups as text", async () => {
    const user = userEvent.setup();
    showPlan();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(await navigator.clipboard.readText()).toBe(COPIED_TEXT);
    expect(mockShowSuccess).toHaveBeenCalledWith(PLANNER_MESSAGE.COPIED);
  });

  it("shows the text, selected, to copy by hand when the browser blocks copying", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    showPlan();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Copy as text" }));
    const text = await screen.findByRole("textbox", { name: PLANNER_MESSAGE.COPY_BLOCKED });
    expect(text).toHaveValue(COPIED_TEXT);
    expect(text).toHaveFocus();
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it("reloads at once with nothing to lose, and asks first when it would throw changes away", async () => {
    const user = userEvent.setup();
    showPlan();
    rereadGives(theirPlan());
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(seatsIn("Group 2")).toEqual(["Edda", "Gwyn", "Dara", "", ""]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rereadGives(plan());
    await moveTo(user, "Fenn", "slot:1:4");
    await user.click(screen.getByRole("button", { name: "Reload" }));
    const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Discard and reload" }));
    await waitFor(() => expect(seatsIn("Group 2")).toEqual(["Edda", "Gwyn", "", "", ""]));
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });

  it("says so when a reload fails, keeping what's on screen", async () => {
    const user = userEvent.setup();
    showPlan();
    rereadFails({ status: 502, data: "" });
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(PLANNER_MESSAGE.RELOAD_FAILED));
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "", ""]);
  });

  it("holds every player still while a save is under way", () => {
    mockSaving = true;
    showPlan();
    renderPlanner();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Move Fenn to" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fenn, Fury Warrior" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear groups" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Visible to raiders" })).toBeDisabled();
  });

  it("asks before leaving with changes it hasn't saved", async () => {
    const user = userEvent.setup();
    showPlan();
    const router = renderPlanner();
    await moveTo(user, "Fenn", "slot:1:4");

    await act(async () => {
      await router.navigate("/wow-forever");
    });
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(router.state.location.pathname).toBe(PLANNER_PATH);
    expect(seatsIn("Group 1")).toEqual(["Aldren", "Brisa", "Cael", "Fenn", ""]);

    await act(async () => {
      await router.navigate("/wow-forever");
    });
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(await screen.findByText("WoW Forever home")).toBeInTheDocument();
  });
});
