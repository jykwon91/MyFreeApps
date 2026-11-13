import { describe, it, expect } from "vitest";
import { nextTabIndex } from "../utils/tabKeyboard";

describe("nextTabIndex", () => {
  it("moves right and wraps from the last tab to the first", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
  });

  it("moves left and wraps from the first tab to the last", () => {
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });

  it("ignores other keys and empty lists", () => {
    expect(nextTabIndex("Enter", 1, 3)).toBeNull();
    expect(nextTabIndex("ArrowDown", 1, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
