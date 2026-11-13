/** The saved character slug lives in the player settings and survives other settings changing. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";

const STORED = { faction: "A", classId: "warlock", zoneId: null, level: 37, position: null, characterSlug: "jason-kwon" };

describe("player settings character slug", () => {
  beforeEach(() => window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(STORED)));
  afterEach(() => window.localStorage.clear());

  it("is read back from storage", () => {
    expect(parsePlayerSettings(STORED)?.characterSlug).toBe("jason-kwon");
    const { result } = renderHook(() => usePlayerSettings());
    expect(result.current[0].characterSlug).toBe("jason-kwon");
  });

  it("is kept when another setting changes", () => {
    const { result } = renderHook(() => usePlayerSettings());
    act(() => result.current[1]({ faction: "H" }));
    expect(result.current[0]).toMatchObject({ faction: "H", characterSlug: "jason-kwon" });
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").characterSlug).toBe("jason-kwon");
  });

  it("is cleared only when asked", () => {
    const { result } = renderHook(() => usePlayerSettings());
    act(() => result.current[1]({ characterSlug: null }));
    expect(result.current[0].characterSlug).toBeNull();
  });
});
