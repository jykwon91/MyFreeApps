import { describe, expect, it } from "vitest";
import { CONFIDENCE_NOTE, notesParagraphs, referenceSummary } from "../utils/documentDraftNotices";

describe("notesParagraphs", () => {
  it("keeps the document's paragraphs and drops blank ones", () => {
    expect(notesParagraphs("First line\nstill first\n\n  \n\nSecond ")).toEqual(["First line\nstill first", "Second"]);
  });

  it("returns nothing for empty notes", () => {
    expect(notesParagraphs("  \n\n ")).toEqual([]);
  });
});

describe("referenceSummary", () => {
  it.each([
    [2, true, "I noticed 2 more terms on the document, plus some notes I jotted down."],
    [1, false, "I noticed 1 more term on the document."],
    [0, true, "I also jotted down some notes about this document."],
  ])("for %s terms and notes=%s", (count, hasNotes, expected) => {
    expect(referenceSummary(count, hasNotes)).toBe(expected);
  });
});

describe("CONFIDENCE_NOTE", () => {
  it("has a line for every confidence the reader reports", () => {
    expect(Object.keys(CONFIDENCE_NOTE).sort()).toEqual(["high", "low", "medium"]);
  });
});
