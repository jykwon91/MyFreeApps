import { rawLineClamps } from "@platform/mobile/test-support/rawLineClamps";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("line limits", () => {
  // At 200% text a one-line limit cuts a name, date or amount short with "…". ClampedText (or ListRowTitle) keeps the
  // limit at a normal size and lifts it at a large one, so every limit in the app goes through them.
  it("every line limit in the app lifts at a large text size", () => {
    expect(rawLineClamps(ROOT, ["src", "app"])).toEqual([]);
  });
});
