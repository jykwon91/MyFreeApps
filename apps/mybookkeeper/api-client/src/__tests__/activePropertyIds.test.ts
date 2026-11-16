import { describe, expect, it } from "vitest";
import { activePropertyIds } from "../utils/activePropertyIds";

describe("activePropertyIds", () => {
  it("narrows to nothing when no property is chosen", () => {
    expect(activePropertyIds([], 3)).toBeUndefined();
  });

  it("narrows to nothing when every property is chosen", () => {
    expect(activePropertyIds(["a", "b", "c"], 3)).toBeUndefined();
  });

  it("narrows to the chosen properties when only some are", () => {
    expect(activePropertyIds(["a", "c"], 3)).toEqual(["a", "c"]);
  });
});
