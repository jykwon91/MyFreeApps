import { clampFile, rawLineClamps } from "@platform/mobile/test-support/rawLineClamps";
import { join } from "path";

const ROOT = join(__dirname, "..");

// Each kept on purpose, after a look at what a person loses at a large text size.
const REVIEWED: Record<string, string> = {
  // The person opens the whole message with "Show more", at any text size.
  "src/features/inquiries/InquiryMessageCard.tsx": "long message the person expands themselves",
  // The caption sits over a square photo tile of a fixed size that can't grow; the tile's label reads it out whole.
  "src/features/listings/ListingPhotoTile.tsx": "caption overlaid on a fixed-size photo tile",
};

describe("line limits", () => {
  // At 200% text a one-line limit cuts a name, date or amount short with "…". ClampedText (or ListRowTitle) keeps the
  // limit at a normal size and lifts it at a large one, so every other limit in the app goes through them.
  it("every line limit in the app lifts at a large text size, but for the reviewed few", () => {
    expect(rawLineClamps(ROOT, ["src", "app"]).filter((site) => !(clampFile(site) in REVIEWED))).toEqual([]);
  });

  it("has no reviewed place left that no longer keeps a limit", () => {
    const files = new Set(rawLineClamps(ROOT, ["src", "app"]).map(clampFile));
    expect(Object.keys(REVIEWED).filter((file) => !files.has(file))).toEqual([]);
  });
});
