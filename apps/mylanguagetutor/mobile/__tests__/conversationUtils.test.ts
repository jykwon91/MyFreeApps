import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";
import type { NativeScrollEvent } from "react-native";
import { isNearBottom } from "../src/utils/isNearBottom";
import { latestReply } from "../src/utils/latestReply";

function scrolledTo(y: number): NativeScrollEvent {
  return {
    contentOffset: { x: 0, y },
    contentSize: { width: 300, height: 1000 },
    layoutMeasurement: { width: 300, height: 600 },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    zoomScale: 1,
  };
}

function entry(overrides: Partial<TranscriptEntry>): TranscriptEntry {
  return { key: "1", learnerText: "Hola", replyText: "", translation: null, corrections: [], retryPrompt: null, status: "pending", correctionsMissing: false, ...overrides };
}

describe("isNearBottom", () => {
  it("counts the end, and just short of it, as reading the newest message", () => {
    expect(isNearBottom(scrolledTo(400), 48)).toBe(true);
    expect(isNearBottom(scrolledTo(352), 48)).toBe(true);
  });

  it("doesn't once the reader has scrolled further up", () => {
    expect(isNearBottom(scrolledTo(351), 48)).toBe(false);
    expect(isNearBottom(scrolledTo(0), 48)).toBe(false);
  });
});

describe("latestReply", () => {
  it("is nothing before the first reply, and while one is still arriving", () => {
    expect(latestReply([])).toBeUndefined();
    expect(latestReply([entry({ replyText: "¡Ho" })])).toBeUndefined();
  });

  it("is the newest reply once it has stopped arriving, cut off or not", () => {
    expect(latestReply([entry({ replyText: "Uno", status: "complete" }), entry({ key: "2", replyText: "Dos", status: "complete" })])).toBe("Dos");
    expect(latestReply([entry({ replyText: "¡Hola!", status: "failed" })])).toBe("¡Hola!");
  });

  it("is nothing when the newest turn got no reply", () => {
    expect(latestReply([entry({ replyText: "Uno", status: "complete" }), entry({ key: "2", status: "failed" })])).toBeUndefined();
  });
});
