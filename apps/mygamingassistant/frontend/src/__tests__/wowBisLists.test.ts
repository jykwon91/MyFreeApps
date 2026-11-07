import { describe, expect, it } from "vitest";
import { __resetDiscordLaunchForTests } from "@platform/ui/discord-activity/launchParams";
import { MGA_SITE_URL } from "@/constants/discordActivity";
import { shareOrigin } from "@/games/wow-forever/lib/shareOrigin";
import { MAX_BIS_LIST_FRAGMENT_LENGTH, MAX_BIS_LISTS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { BIS_SLOTS } from "@/games/wow-forever/data/bisLists/bisSlots";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import { decodeBisListFragment, encodeBisListFragment, isBisListFragment } from "@/games/wow-forever/lib/bisLists/bisListFragment";
import { cleanBisListName, duplicateBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { bisListsReducer, EMPTY_BIS_LISTS } from "@/games/wow-forever/lib/bisLists/bisListsReducer";
import { bisListShareUrl } from "@/games/wow-forever/lib/bisLists/bisListShareUrl";
import { bisListProgress, bisListSubtitle, suggestedBisListName } from "@/games/wow-forever/lib/bisLists/bisListText";
import { bisSlotGroup, bisSlotsFor, fitsBisSlot } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import { checkSharedList } from "@/games/wow-forever/lib/bisLists/checkSharedList";
import { makeBisList } from "@/games/wow-forever/lib/bisLists/newBisList";
import { parseItemId } from "@/games/wow-forever/lib/bisLists/parseBisListItems";
import { parseStoredBisLists } from "@/games/wow-forever/lib/bisLists/parseStoredBisLists";
import { placeBisItem } from "@/games/wow-forever/lib/bisLists/placeBisItem";
import { startingBisItems } from "@/games/wow-forever/lib/bisLists/startingBisItems";
import { tidyBisListItems } from "@/games/wow-forever/lib/bisLists/tidyBisListItems";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListsState } from "@/games/wow-forever/types/bisLists/bisListsState";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearRanking } from "@/games/wow-forever/types/gearRanking";
import type { GearSlotResult } from "@/games/wow-forever/types/gearSlotResult";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";
import { fixtureList } from "./wowClientItemsFixture";

const WARRIOR: SharedBisList = {
  name: "Fury pre-raid",
  classId: "warrior",
  specId: "fury",
  phase: "preraid",
  items: { head: 12640, chest: 11604, main_hand: 2848 },
};

function saved(id: string, patch: Partial<BisList> = {}): BisList {
  return { ...makeBisList(WARRIOR, id, 1), ...patch };
}

/** A fresh page load at `url`: inside/outside Discord is worked out again. */
function loadPage(url: string): void {
  window.history.replaceState(null, "", url);
  __resetDiscordLaunchForTests();
}

function stateOf(...lists: BisList[]): BisListsState {
  return { lists, selectedId: lists[0]?.id ?? null };
}

describe("share-link fragment", () => {
  it("round-trips a list", () => {
    const fragment = encodeBisListFragment(WARRIOR);
    expect(fragment).toBe("list=1~warrior~fury~preraid~head:12640,chest:11604,main_hand:2848~Fury%20pre-raid");
    expect(decodeBisListFragment(`#${fragment}`)).toEqual(WARRIOR);
    expect(isBisListFragment(`#${fragment}`)).toBe(true);
    expect(isBisListFragment("#something-else")).toBe(false);
  });

  it("escapes every character that would break the split, and round-trips any name", () => {
    const name = "Tank ~ (the) *best*! it's 100% mine";
    const fragment = encodeBisListFragment({ ...WARRIOR, name });
    expect(fragment.split("~")).toHaveLength(6);
    expect(fragment).not.toMatch(/[!'()*]/);
    expect(decodeBisListFragment(fragment)?.name).toBe(name);
  });

  it("undoes one layer of percent-encoding from apps that escape the separator", () => {
    const value = encodeBisListFragment(WARRIOR).slice("list=".length);
    // Only "~" escaped, and the whole value escaped (":" "," "%" too; encodeURIComponent keeps "~").
    expect(decodeBisListFragment(`#list=${value.replace(/~/g, "%7E")}`)).toEqual(WARRIOR);
    expect(decodeBisListFragment(`#list=${encodeURIComponent(value)}`)).toEqual(WARRIOR);
  });

  it("never undoes escaping a link didn't have, and keeps a name's own escaped ~", () => {
    for (const name of ["Tank: 100%", "A: ~B", "50%7E off"]) {
      const empty: SharedBisList = { ...WARRIOR, name, items: {} };
      expect(decodeBisListFragment(encodeBisListFragment(empty))).toEqual(empty);
      const value = encodeBisListFragment({ ...WARRIOR, name }).slice("list=".length);
      expect(decodeBisListFragment(`list=${value.replace(/~/g, "%7E")}`)?.name).toBe(name);
    }
    expect(decodeBisListFragment("list=1%7Ewarrior%7Efury%7Epreraid%7Ehead:1")).toBeNull();
  });

  it("refuses oversized input, a wrong version, an unknown class or a wrong field count", () => {
    const valid = encodeBisListFragment(WARRIOR);
    expect(decodeBisListFragment(`${valid}${"x".repeat(MAX_BIS_LIST_FRAGMENT_LENGTH)}`)).toBeNull();
    expect(decodeBisListFragment(valid.replace("list=1~", "list=2~"))).toBeNull();
    expect(decodeBisListFragment(valid.replace("~warrior~", "~deathknight~"))).toBeNull();
    expect(decodeBisListFragment("list=1~warrior~fury~preraid~head:1")).toBeNull();
    expect(decodeBisListFragment("other=1~warrior~fury~preraid~~x")).toBeNull();
  });

  it("falls back on an unknown spec or phase, and ignores unknown slots and bad ids", () => {
    const list = decodeBisListFragment("list=1~warrior~nope~mythic~head:12640,shirt:5,neck:abc,back:0,feet:12345678,legs:-3,waist~X");
    expect(list).toEqual({ name: "X", classId: "warrior", specId: "arms", phase: "preraid", items: { head: 12640 } });
  });

  it("keeps the first value when a slot repeats, and caps the rows read", () => {
    expect(decodeBisListFragment("list=1~warrior~fury~raid~head:1,head:2~a")?.items).toEqual({ head: 1 });
    const many = Array.from({ length: 40 }, () => "head:7").join(",");
    expect(decodeBisListFragment(`list=1~warrior~fury~raid~${many}~a`)?.items).toEqual({ head: 7 });
  });

  it("strips hidden and bidi characters from a shared name, and survives a broken escape", () => {
    expect(decodeBisListFragment("list=1~warrior~fury~raid~~%E2%80%AEevil%E2%80%8B")?.name).toBe("evil");
    expect(decodeBisListFragment("list=1~warrior~fury~raid~~%E0%A4%A")?.name).toBe("My list");
  });

  it("builds a share URL with the list only in the fragment", () => {
    expect(bisListShareUrl("https://example.test", WARRIOR)).toBe(
      `https://example.test/wow-forever/gear?view=mine#${encodeBisListFragment(WARRIOR)}`,
    );
  });

  it("points share links at the real site from inside the Discord Activity", () => {
    loadPage("/wow-forever/gear");
    expect(shareOrigin()).toBe(window.location.origin);
    loadPage("/wow-forever/gear?frame_id=frame-1&instance_id=instance-1&platform=desktop");
    expect(shareOrigin()).toBe(MGA_SITE_URL);
    sessionStorage.clear();
    loadPage("/");
  });
});

describe("parseItemId", () => {
  it("accepts 1-7 digit positive ids only", () => {
    expect(parseItemId("12640")).toBe(12640);
    expect(parseItemId(18608)).toBe(18608);
    for (const bad of ["0", "012", "1.5", "1e3", "", "12345678", -1, 1.5, null, {}]) expect(parseItemId(bad)).toBeNull();
  });
});

describe("list names", () => {
  it("collapses spaces, drops control characters and caps the length", () => {
    expect(cleanBisListName("  a \n\t b\u0000 ")).toBe("a b");
    expect(cleanBisListName("   ")).toBe("My list");
    expect(cleanBisListName("x".repeat(80))).toHaveLength(60);
    expect(duplicateBisListName("Tank")).toBe("Copy of Tank");
  });

  it("suggests a name and subtitle from class, spec and phase", () => {
    expect(bisListSubtitle(WARRIOR)).toBe("Fury Warrior · Pre-raid");
    expect(suggestedBisListName({ classId: "warlock", specId: "affliction", phase: "raid" })).toBe("Affliction Warlock Raid");
  });
});

describe("slots", () => {
  it("every row fills from a real Best gear card", () => {
    for (const slot of BIS_SLOTS) expect(GEAR_SLOT_GROUPS).toContain(bisSlotGroup(slot.id));
  });

  it("drops the rows a class never fills", () => {
    expect(bisSlotsFor("rogue").map((s) => s.id)).not.toContain("two_hand");
    expect(bisSlotsFor("paladin").map((s) => s.id)).not.toContain("ranged");
    expect(bisSlotsFor("warrior")).toHaveLength(BIS_SLOTS.length);
  });

  it("only fits items the class can wear in that row", () => {
    const { byId } = fixtureList();
    const get = (id: number) => byId.get(id) as ClientItem;
    expect(fitsBisSlot(get(12640), "head", "warrior")).toBe(true);
    expect(fitsBisSlot(get(12640), "head", "mage")).toBe(false);
    expect(fitsBisSlot(get(12640), "chest", "warrior")).toBe(false);
    expect(fitsBisSlot(get(2848), "off_hand", "warrior")).toBe(true);
    expect(fitsBisSlot(get(18608), "two_hand", "priest")).toBe(true);
    expect(fitsBisSlot(get(18608), "two_hand", "warrior")).toBe(false);
  });
});

describe("placeBisItem", () => {
  it("a two-hander empties both hands, and either hand empties the two-hander", () => {
    expect(placeBisItem({ main_hand: 1, off_hand: 2, head: 3 }, "two_hand", 9)).toEqual({
      items: { two_hand: 9, head: 3 },
      cleared: ["main_hand", "off_hand"],
    });
    expect(placeBisItem({ two_hand: 9 }, "off_hand", 2)).toEqual({ items: { off_hand: 2 }, cleared: ["two_hand"] });
    expect(placeBisItem({ head: 3 }, "head", null)).toEqual({ items: {}, cleared: [] });
  });
});

describe("checkSharedList", () => {
  it("drops ids not in the item data, items that don't fit, and a clashing hand", () => {
    const list: SharedBisList = {
      ...WARRIOR,
      items: { head: 12640, neck: 999999, chest: 9007, two_hand: 18608, main_hand: 2848 },
    };
    const { list: kept, dropped } = checkSharedList(list, fixtureList().byId);
    // 999999 isn't an item, the robe is cloth for mages/priests, the staff is priest-only.
    expect(kept.items).toEqual({ head: 12640, main_hand: 2848 });
    expect(dropped).toBe(3);
  });

  it("keeps the two-hander over a one-hand row when both fit", () => {
    const list: SharedBisList = { ...WARRIOR, classId: "priest", specId: "holy", items: { two_hand: 18608, main_hand: 2848 } };
    expect(checkSharedList(list, fixtureList().byId)).toEqual({ list: { ...list, items: { two_hand: 18608 } }, dropped: 1 });
  });
});

describe("bisListsReducer", () => {
  it("creates and selects, refusing a repeated id or more than the cap", () => {
    const one = bisListsReducer(EMPTY_BIS_LISTS, { type: "create", list: saved("a") });
    expect(one).toEqual({ lists: [saved("a")], selectedId: "a" });
    expect(bisListsReducer(one, { type: "create", list: saved("a") })).toBe(one);
    const full = stateOf(...Array.from({ length: MAX_BIS_LISTS }, (_, i) => saved(`l${i}`)));
    expect(bisListsReducer(full, { type: "create", list: saved("new") })).toBe(full);
  });

  it("load takes another tab's lists, keeping this tab's selection while it exists", () => {
    const here = { ...stateOf(saved("a"), saved("b")), selectedId: "b" };
    const other = stateOf(saved("a"), saved("b"), saved("c"));
    expect(bisListsReducer(here, { type: "load", state: other })).toEqual({ lists: other.lists, selectedId: "b" });
    expect(bisListsReducer(here, { type: "load", state: stateOf(saved("a")) }).selectedId).toBe("a");
    expect(bisListsReducer(here, { type: "load", state: EMPTY_BIS_LISTS })).toEqual(EMPTY_BIS_LISTS);
  });

  it("selects only a list that exists", () => {
    const s = stateOf(saved("a"), saved("b"));
    expect(bisListsReducer(s, { type: "select", id: "b" }).selectedId).toBe("b");
    expect(bisListsReducer(s, { type: "select", id: "zzz" })).toBe(s);
  });

  it("renames with a cleaned name, keeping the old one when blank", () => {
    const s = stateOf(saved("a"));
    expect(bisListsReducer(s, { type: "rename", id: "a", name: "  Tank  set ", now: 5 }).lists[0]).toMatchObject({ name: "Tank set", updatedAt: 5 });
    expect(bisListsReducer(s, { type: "rename", id: "a", name: "   ", now: 5 })).toBe(s);
  });

  it("duplicates right after the source and selects the copy", () => {
    const s = stateOf(saved("a"), saved("b"));
    const next = bisListsReducer(s, { type: "duplicate", id: "a", newId: "c", now: 9 });
    expect(next.lists.map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(next.lists[1]).toMatchObject({ name: "Copy of Fury pre-raid", items: WARRIOR.items, updatedAt: 9 });
    expect(next.selectedId).toBe("c");
  });

  it("delete selects the next list, else the one before, else nothing", () => {
    const s = { ...stateOf(saved("a"), saved("b"), saved("c")), selectedId: "b" };
    expect(bisListsReducer(s, { type: "delete", id: "b" }).selectedId).toBe("c");
    const last = { ...s, selectedId: "c" };
    expect(bisListsReducer(last, { type: "delete", id: "c" }).selectedId).toBe("b");
    expect(bisListsReducer(stateOf(saved("a")), { type: "delete", id: "a" })).toEqual(EMPTY_BIS_LISTS);
    expect(bisListsReducer(s, { type: "delete", id: "a" }).selectedId).toBe("b");
  });

  it("setItem clears clashing rows and their ticks; toggleObtained needs a filled row", () => {
    const s = stateOf(saved("a", { obtained: ["main_hand", "head"] }));
    const next = bisListsReducer(s, { type: "setItem", id: "a", slot: "two_hand", itemId: 18608, now: 3 });
    expect(next.lists[0].items).toEqual({ head: 12640, chest: 11604, two_hand: 18608 });
    expect(next.lists[0].obtained).toEqual(["head"]);
    expect(bisListsReducer(s, { type: "setItem", id: "a", slot: "head", itemId: 12640, now: 3 })).toBe(s);
    expect(bisListsReducer(s, { type: "toggleObtained", id: "a", slot: "feet", now: 3 })).toBe(s);
    const ticked = bisListsReducer(s, { type: "toggleObtained", id: "a", slot: "chest", now: 3 });
    expect(bisListProgress(ticked.lists[0])).toEqual({ filled: 3, obtained: 3 });
    expect(bisListsReducer(ticked, { type: "toggleObtained", id: "a", slot: "chest", now: 4 }).lists[0].obtained).toEqual(["main_hand", "head"]);
  });
});

describe("parseStoredBisLists", () => {
  it("keeps good lists and drops broken ones, deduping ids", () => {
    const parsed = parseStoredBisLists({
      lists: [
        { ...saved("a"), obtained: ["head", "feet", "bogus"] },
        { ...saved("a"), name: "dupe" },
        { id: "b", classId: "deathknight", items: {} },
        { id: "c", classId: "mage", specId: "nope", phase: "x", name: 5, items: { head: "12640", tail: 1 }, updatedAt: "x" },
        "junk",
      ],
      selectedId: "missing",
    });
    expect(parsed?.lists.map((l) => l.id)).toEqual(["a", "c"]);
    expect(parsed?.lists[0].obtained).toEqual(["head"]);
    expect(parsed?.lists[1]).toEqual({
      id: "c",
      name: "My list",
      classId: "mage",
      specId: "arcane",
      phase: "preraid",
      items: { head: 12640 },
      obtained: [],
      updatedAt: 0,
    });
    expect(parsed?.selectedId).toBe("a");
  });

  it("drops rows the class has no slot for, and a one-hand row beside a two-hander", () => {
    const parsed = parseStoredBisLists({
      lists: [
        { ...saved("r"), classId: "rogue", specId: "combat", items: { two_hand: 1, main_hand: 2, head: 3 }, obtained: ["two_hand", "head"] },
        { ...saved("p"), classId: "priest", specId: "holy", items: { two_hand: 18608, off_hand: 2 } },
      ],
    });
    expect(parsed?.lists[0]).toMatchObject({ items: { main_hand: 2, head: 3 }, obtained: ["head"] });
    expect(parsed?.lists[1].items).toEqual({ two_hand: 18608 });
    expect(tidyBisListItems({ ranged: 5, head: 3 }, "paladin")).toEqual({ head: 3 });
  });

  it("returns null for something that isn't our shape", () => {
    expect(parseStoredBisLists(null)).toBeNull();
    expect(parseStoredBisLists({ lists: "x" })).toBeNull();
    expect(parseStoredBisLists({ lists: [] })).toEqual(EMPTY_BIS_LISTS);
  });
});

describe("startingBisItems", () => {
  const facts = { requires: null, reputation: null, pvp: false, bindOnPickup: false };
  const ranked = (id: number, score: number): RankedGearItem => ({
    item: { ...(fixtureList().byId.get(12640) as ClientItem), id },
    score,
    pctOfBest: 100,
    sources: [],
    facts,
    availableFrom: 60,
    availableFromEstimated: false,
  });
  const card = (groupId: string, top: RankedGearItem[]): GearSlotResult => ({
    group: GEAR_SLOT_GROUPS.find((g) => g.id === groupId) as GearSlotResult["group"],
    top,
    nextUpgrade: null,
    unknownEpics: [],
  });
  const ranking = (slots: GearSlotResult[]): GearRanking => ({ slots, unknownLevelCount: 0 });

  it("takes each card's top pick and the top two rings and trinkets", () => {
    const items = startingBisItems(
      ranking([card("head", [ranked(1, 10), ranked(2, 9)]), card("finger", [ranked(3, 5), ranked(4, 4), ranked(5, 3)]), card("trinket", [ranked(6, 5)]), card("feet", [])]),
    );
    expect(items).toEqual({ head: 1, finger1: 3, finger2: 4, trinket1: 6 });
  });

  it("picks the two-hander unless main hand + a different off hand score more", () => {
    const weapons = (two: number) =>
      ranking([card("two_hand", [ranked(10, two)]), card("main_hand", [ranked(11, 6)]), card("off_hand", [ranked(11, 6), ranked(12, 5)])]);
    expect(startingBisItems(weapons(12))).toEqual({ two_hand: 10 });
    expect(startingBisItems(weapons(10))).toEqual({ main_hand: 11, off_hand: 12 });
  });
});
