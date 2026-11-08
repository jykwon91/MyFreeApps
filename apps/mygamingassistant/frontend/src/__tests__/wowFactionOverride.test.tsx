import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useFactionOverride } from "@/games/wow-forever/hooks/useFactionOverride";
import { FACTION } from "@/games/wow-forever/types/worldMap";

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return renderHook(() => ({ override: useFactionOverride(), location: useLocation() }), { wrapper });
}

describe("useFactionOverride", () => {
  it("reads a valid faction from the URL and ignores anything else", () => {
    expect(setup("/m?faction=H").result.current.override.faction).toBe(FACTION.horde);
    expect(setup("/m?faction=A").result.current.override.faction).toBe(FACTION.alliance);
    expect(setup("/m?faction=N").result.current.override.faction).toBeNull();
    expect(setup("/m").result.current.override.faction).toBeNull();
  });

  it("clear drops only the faction param and never writes the saved settings", () => {
    window.localStorage.removeItem(PLAYER_SETTINGS_STORAGE_KEY);
    const { result } = setup("/m?to=npc%3A1&faction=H&dir=1");
    act(() => result.current.override.clear());
    expect(result.current.override.faction).toBeNull();
    expect(result.current.location.search).toBe("?to=npc%3A1&dir=1");
    expect(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
