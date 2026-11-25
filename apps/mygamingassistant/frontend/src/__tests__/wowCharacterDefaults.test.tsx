/** The selected character is the default for faction / class / level; a typed value wins until another character or the reset. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  PLAYER_OVERRIDES_STORAGE_KEY,
  PLAYER_SETTINGS_STORAGE_KEY,
  followCharacterSettings,
  usePlayerOverrides,
  usePlayerSettings,
} from "@/games/wow-forever/hooks/usePlayerSettings";
import { characterSkillIn } from "@/games/wow-forever/lib/character/characterSkill";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

const SAVED = { faction: "A", classId: "warlock", zoneId: null, level: 40, position: null, characterSlug: "jason-kwon" };
const NOW_59 = { faction: "A", classId: "warlock", level: 59, characterSlug: "jason-kwon" } as const;

function mount() {
  return renderHook(() => ({ player: usePlayerSettings(), overrides: usePlayerOverrides() }));
}

describe("character defaults", () => {
  beforeEach(() => window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(SAVED)));
  afterEach(() => window.localStorage.clear());

  it("follows the character's level when nothing was typed", () => {
    const { result } = mount();
    act(() => followCharacterSettings(NOW_59));
    expect(result.current.player[0].level).toBe(59);
    expect(result.current.overrides).toEqual([]);
  });

  it("keeps a typed level over the character's, and follows the other fields", () => {
    const { result } = mount();
    act(() => result.current.player[1]({ level: 30 }));
    expect(result.current.overrides).toEqual(["level"]);
    act(() => followCharacterSettings({ ...NOW_59, faction: "H" }));
    expect(result.current.player[0]).toMatchObject({ level: 30, faction: "H" });
  });

  it("selecting a character (or the reset) drops every override", () => {
    const { result } = mount();
    act(() => result.current.player[1]({ level: 30 }));
    act(() => result.current.player[1](NOW_59));
    expect(result.current.player[0].level).toBe(59);
    expect(result.current.overrides).toEqual([]);
  });

  it("switching to another character replaces what was typed", () => {
    const { result } = mount();
    act(() => result.current.player[1]({ classId: "mage" }));
    act(() => result.current.player[1]({ faction: "H", classId: "shaman", level: 12, characterSlug: "other-one" }));
    expect(result.current.player[0]).toMatchObject({ classId: "shaman", level: 12, characterSlug: "other-one" });
    expect(result.current.overrides).toEqual([]);
  });

  it("ignores a character that is not the selected one", () => {
    const { result } = mount();
    act(() => followCharacterSettings({ ...NOW_59, characterSlug: "someone-else" }));
    expect(result.current.player[0].level).toBe(40);
  });

  it("with no character selected there are no overrides and edits behave as before", () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ ...SAVED, characterSlug: null }));
    const { result } = mount();
    act(() => result.current.player[1]({ level: 22 }));
    expect(result.current.player[0].level).toBe(22);
    expect(result.current.overrides).toEqual([]);
    expect(window.localStorage.getItem(PLAYER_OVERRIDES_STORAGE_KEY)).toBeNull();
  });
});

describe("characterSkillIn", () => {
  const character = {
    professions: {
      primaries: [{ id: 197, skill: 254, max_skill: 300, recipes: [] }],
      secondaries: [{ id: 185, skill: 150, max_skill: 225, recipes: [] }],
    },
  } as unknown as CharacterResponse;

  it("reads a main and a secondary profession, null for one not learned", () => {
    expect(characterSkillIn(character, "tailoring")).toBe(254);
    expect(characterSkillIn(character, "cooking")).toBe(150);
    expect(characterSkillIn(character, "mining")).toBeNull();
  });
});
