import { describe, it, expect } from "vitest";
import { dropDeleteMessage } from "../dropDeleteMessage";

describe("dropDeleteMessage", () => {
  it("names only the slots when the drop has no expenses", () => {
    expect(dropDeleteMessage(0)).toBe("The drop and all its slots will be removed. This can't be undone.");
  });

  it("says the one expense goes too", () => {
    expect(dropDeleteMessage(1)).toBe("The drop, its slots and its 1 expense will be removed. This can't be undone.");
  });

  it("counts several expenses", () => {
    expect(dropDeleteMessage(3)).toBe("The drop, its slots and its 3 expenses will be removed. This can't be undone.");
  });

  it("still warns about expenses when they could not be counted", () => {
    expect(dropDeleteMessage(undefined)).toBe(
      "The drop, its slots and any expenses logged against it will be removed. This can't be undone.",
    );
  });
});
