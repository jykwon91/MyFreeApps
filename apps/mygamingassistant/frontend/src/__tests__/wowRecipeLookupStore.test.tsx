import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

const mockLoadRecipeBook = vi.fn();
vi.mock("@/games/wow-forever/lib/recipes/loadRecipeBook", () => ({ loadRecipeBook: () => mockLoadRecipeBook() }));

const LINEN_ENTRY = {
  key: "tailoring:2963", profession: "tailoring", name: "Bolt of Linen Cloth", icon: null, makes: null,
  category: "trade-goods", skill: 1, yellow: null, green: null, grey: null, reagents: [], learn: { kind: "start" },
  recipeSources: null, sourceUnknown: false, spec: null, searchName: "bolt of linen cloth", nameWords: [],
  recipeItemWords: [], reagentWords: [],
} as unknown as RecipeEntry;

// The store is module state: a fresh copy per test.
async function freshHook() {
  vi.resetModules();
  return (await import("@/games/wow-forever/hooks/useRecipeLookup")).useRecipeLookup;
}

beforeEach(() => {
  mockLoadRecipeBook.mockReset();
});

describe("the shared recipe lookup", () => {
  it("loads the recipe book once for every recipe name on the page, and updates them all", async () => {
    mockLoadRecipeBook.mockResolvedValue([LINEN_ENTRY]);
    const useRecipeLookup = await freshHook();
    const first = renderHook(() => useRecipeLookup());
    const second = renderHook(() => useRecipeLookup());
    expect(first.result.current).toBeNull();
    await waitFor(() => expect(first.result.current?.get("tailoring:2963")).toBe(LINEN_ENTRY));
    expect(second.result.current?.get("tailoring:2963")).toBe(LINEN_ENTRY);
    expect(mockLoadRecipeBook).toHaveBeenCalledTimes(1);
  });

  it("stays empty after a failed load, and the next recipe name to mount tries again", async () => {
    mockLoadRecipeBook.mockRejectedValueOnce(new Error("chunk failed")).mockResolvedValue([LINEN_ENTRY]);
    const useRecipeLookup = await freshHook();
    const first = renderHook(() => useRecipeLookup());
    await act(async () => {
      await Promise.resolve();
    });
    expect(first.result.current).toBeNull();
    first.unmount();

    const retry = renderHook(() => useRecipeLookup());
    await waitFor(() => expect(retry.result.current?.get("tailoring:2963")).toBe(LINEN_ENTRY));
    expect(mockLoadRecipeBook).toHaveBeenCalledTimes(2);
  });
});
