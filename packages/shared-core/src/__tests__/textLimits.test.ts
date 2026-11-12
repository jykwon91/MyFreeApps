import { describe, expect, it } from "vitest";
import { characterCounter } from "../utils/characterCounter";
import { textLength } from "../utils/textLength";
import { tooLongProblem } from "../utils/tooLongProblem";

// One emoji is two UTF-16 units but one code point, which is how the backend counts.
const EMOJI = "😀";

describe("textLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(textLength("")).toBe(0);
    expect(textLength("abc")).toBe(3);
    expect(textLength(EMOJI.repeat(4))).toBe(4);
  });
});

describe("characterCounter", () => {
  it("is silent while the value is well within the limit", () => {
    expect(characterCounter("a".repeat(100), 5000)).toBeUndefined();
  });

  it("shows the count against the limit near it and over it", () => {
    expect(characterCounter("a".repeat(4500), 5000)).toBe("4,500 / 5,000");
    expect(characterCounter("a".repeat(5100), 5000)).toBe("5,100 / 5,000");
  });

  it("counts an emoji once", () => {
    expect(characterCounter(EMOJI.repeat(90), 100)).toBe("90 / 100");
  });
});

describe("tooLongProblem", () => {
  it("is silent at the limit and says the limit, never the count", () => {
    expect(tooLongProblem("a".repeat(200), 200)).toBeUndefined();
    expect(tooLongProblem("a".repeat(236), 200)).toBe("Keep this to 200 characters or fewer.");
  });

  it("gives the same message whatever the over-limit length, so a screen reader isn't re-told it", () => {
    expect(tooLongProblem("a".repeat(5100), 5000)).toBe("Keep this to 5,000 characters or fewer.");
    expect(tooLongProblem("a".repeat(5101), 5000)).toBe(tooLongProblem("a".repeat(5100), 5000));
  });

  it("counts an emoji once, as the backend does", () => {
    expect(EMOJI.length).toBe(2);
    expect(tooLongProblem(EMOJI.repeat(200), 200)).toBeUndefined();
    expect(tooLongProblem(EMOJI.repeat(201), 200)).toBe("Keep this to 200 characters or fewer.");
  });
});
