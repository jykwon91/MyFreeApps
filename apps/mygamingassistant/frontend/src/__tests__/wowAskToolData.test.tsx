import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LOAD_STATUS } from "@/games/wow-forever/hooks/useWorldMapData";
import { useAskToolData } from "@/games/wow-forever/hooks/ask/useAskToolData";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { ASK_WORLD } from "./wowAskWorld";

const merged: WorldMapData = { ...ASK_WORLD };

vi.mock("@/games/wow-forever/hooks/useWorldMap", () => ({
  useWorldMap: () => ({ status: LOAD_STATUS.ready, data: merged, retry: () => undefined, capturesFailed: false }),
}));

describe("useAskToolData", () => {
  it("searches the World Map's merged data (Classic + Seen in game captures), not the raw seed", () => {
    const { result } = renderHook(() => useAskToolData());
    expect(result.current.data?.world).toBe(merged);
  });
});
