import { describe, expect, it } from "vitest";
import { DISCOVER_VIEW_LABELS, DISCOVER_VIEWS } from "../constants/discoverViewLabels";

describe("DISCOVER_VIEWS", () => {
  it("lists every view once, Inbox first and Dismissed last, each with a label", () => {
    expect(DISCOVER_VIEWS).toEqual(["inbox", "saved", "dismissed"]);
    expect(DISCOVER_VIEWS.map((view) => DISCOVER_VIEW_LABELS[view])).toEqual(["Inbox", "Saved", "Dismissed"]);
  });
});
