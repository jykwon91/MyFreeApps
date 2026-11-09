import { describe, expect, it } from "vitest";
import { pruneSelection } from "../utils/pruneSelection";

describe("pruneSelection", () => {
  it("keeps the ticks that are still valid, and returns the same set when none dropped", () => {
    const selected = new Set(["a", "b"]);
    expect(pruneSelection(selected, ["a", "b", "c"])).toBe(selected);
  });

  it("drops ticks for ids no longer there", () => {
    expect([...pruneSelection(new Set(["a", "b", "c"]), ["b", "d"])]).toEqual(["b"]);
    expect(pruneSelection(new Set(["a"]), []).size).toBe(0);
  });

  it("accepts any iterable of ids", () => {
    expect([...pruneSelection(new Set(["a", "b"]), new Set(["a"]))]).toEqual(["a"]);
  });
});
