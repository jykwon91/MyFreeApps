/** Best gear, the food picker, Downrank and the Goal planner start from the selected character; a typed value wins until the reset. */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { followCharacterSettings, PLAYER_SETTINGS_STORAGE_KEY, usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useDownrankSettings } from "@/games/wow-forever/hooks/useDownrankSettings";
import { useFoodPickerSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";
import { useGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import { useGoalPlannerGoals } from "@/games/wow-forever/hooks/useGoalPlannerGoals";
import type { SelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";

const CHARACTER = {
  professions: {
    primaries: [{ id: 197, skill: 254, max_skill: 300, recipes: [] }],
    secondaries: [{ id: 185, skill: 150, max_skill: 225, recipes: [] }],
  },
} as unknown as CharacterResponse;

const selected = vi.hoisted(() => ({ value: null as SelectedCharacter | null }));
vi.mock("@/games/wow-forever/hooks/useSelectedCharacter", () => ({
  useSelectedCharacter: () => selected.value,
}));

const SAVED = { faction: "A", classId: "warlock", zoneId: null, level: 59, position: null, characterSlug: "jason-kwon" };
const FAMILIES = [
  { id: "priest-heal", classId: "priest", ranks: [] },
  { id: "druid-healing-touch", classId: "druid", ranks: [] },
] as unknown as readonly DownrankFamily[];

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/wow-forever/page"]}>{children}</MemoryRouter>;
}

function selectCharacter(on: boolean) {
  selected.value = on
    ? { slug: "jason-kwon", name: "Jason Kwon", character: CHARACTER }
    : { slug: null, name: null, character: undefined };
  window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ ...SAVED, characterSlug: on ? "jason-kwon" : null }));
}

describe("Best gear", () => {
  beforeEach(() => selectCharacter(true));
  afterEach(() => window.localStorage.clear());

  it("starts from the character, keeps following it after another setting changes, and resets", () => {
    const { result } = renderHook(() => ({ gear: useGearSettings(), player: usePlayerSettings() }), { wrapper });
    expect(result.current.gear[0]).toMatchObject({ classId: "warlock", level: 59, faction: "A" });
    expect(result.current.gear[2]).toMatchObject({ characterName: "Jason Kwon", overridden: false });

    act(() => result.current.gear[1]({ includePvp: true }));
    act(() => followCharacterSettings({ faction: "A", classId: "warlock", level: 60, characterSlug: "jason-kwon" }));
    expect(result.current.gear[0].level).toBe(60);

    act(() => result.current.gear[1]({ level: 30 }));
    expect(result.current.gear[0].level).toBe(30);
    expect(result.current.gear[2]?.overridden).toBe(true);

    act(() => result.current.gear[2]?.reset());
    expect(result.current.gear[0].level).toBe(60);
    expect(result.current.gear[2]?.overridden).toBe(false);
  });

  it("a typed class drops the spec back to the new class's first", () => {
    const { result } = renderHook(() => useGearSettings(), { wrapper });
    act(() => result.current[1]({ classId: "mage" }));
    expect(result.current[0].classId).toBe("mage");
    expect(result.current[2]?.overridden).toBe(true);
  });

  it("with no character it is the remembered settings, with no reset", () => {
    selectCharacter(false);
    const { result } = renderHook(() => useGearSettings(), { wrapper });
    act(() => result.current[1]({ level: 22 }));
    expect(result.current[0].level).toBe(22);
    expect(result.current[2]).toBeNull();
  });
});

describe("Food picker", () => {
  beforeEach(() => selectCharacter(true));
  afterEach(() => window.localStorage.clear());

  it("starts from the character's level, class and Cooking skill, and resets", () => {
    const { result } = renderHook(() => useFoodPickerSettings(), { wrapper });
    expect(result.current[0]).toMatchObject({ level: 59, classId: "warlock", cookingSkill: 150 });
    expect(result.current[2]?.overridden).toBe(false);

    act(() => result.current[1]({ cookingSkill: 200 }));
    expect(result.current[0].cookingSkill).toBe(200);
    expect(result.current[2]?.overridden).toBe(true);

    act(() => result.current[2]?.reset());
    expect(result.current[0].cookingSkill).toBe(150);
    expect(result.current[2]?.overridden).toBe(false);
  });

  it("a Cooking skill cleared over the character's stays empty", () => {
    const { result } = renderHook(() => useFoodPickerSettings(), { wrapper });
    act(() => result.current[1]({ cookingSkill: null }));
    expect(result.current[0].cookingSkill).toBeNull();
  });

  it("with no character the Cooking skill starts empty", () => {
    selectCharacter(false);
    const { result } = renderHook(() => useFoodPickerSettings(), { wrapper });
    expect(result.current[0].cookingSkill).toBeNull();
    expect(result.current[2]).toBeNull();
  });
});

describe("Downrank", () => {
  beforeEach(() => selectCharacter(true));
  afterEach(() => window.localStorage.clear());

  it("follows the character's level, a typed level wins, the reset returns", () => {
    const { result } = renderHook(() => useDownrankSettings(FAMILIES), { wrapper });
    expect(result.current[0].level).toBe(59);
    act(() => result.current[1]({ level: 30 }));
    expect(result.current[0].level).toBe(30);
    expect(result.current[2]?.overridden).toBe(true);
    act(() => result.current[2]?.reset());
    expect(result.current[0].level).toBe(59);
    expect(result.current[2]?.overridden).toBe(false);
  });
});

describe("Goal planner", () => {
  beforeEach(() => selectCharacter(true));
  afterEach(() => window.localStorage.clear());

  it("a profession goal starts at the character's skill, 0 for one not learned", () => {
    const { result } = renderHook(() => useGoalPlannerGoals(), { wrapper });
    act(() => result.current.addProfession("tailoring"));
    act(() => result.current.addProfession("cooking"));
    act(() => result.current.addProfession("alchemy"));
    expect(result.current.goals.professions.map((g) => [g.profession, g.current])).toEqual([
      ["tailoring", 254],
      ["cooking", 150],
      ["alchemy", 0],
    ]);
  });
});
