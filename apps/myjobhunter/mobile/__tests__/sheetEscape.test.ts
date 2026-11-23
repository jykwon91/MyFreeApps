import { sheetEscapeProblems } from "@platform/mobile/test-support/sheetEscapeProblems";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("closing sheets with the screen reader's escape gesture", () => {
  // VoiceOver's two-finger scrub closes a sheet only if a view in it handles the gesture. SheetModal does, through the
  // same close as Back and Cancel, so every page sheet goes through it; a full-screen Modal handles it itself.
  it("every Modal in the app closes on the escape gesture", () => {
    expect(sheetEscapeProblems(ROOT, ["src", "app"])).toEqual([]);
  });
});
