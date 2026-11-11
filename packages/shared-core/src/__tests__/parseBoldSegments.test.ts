import { describe, expect, it } from "vitest";
import { parseBoldSegments } from "../utils/parseBoldSegments";

describe("parseBoldSegments", () => {
  it("returns a single plain segment for a string with no bold markers", () => {
    expect(parseBoldSegments("hello world")).toEqual([{ text: "hello world", bold: false }]);
  });

  it("returns a single bold segment for a fully-wrapped string", () => {
    expect(parseBoldSegments("**bold**")).toEqual([{ text: "bold", bold: true }]);
  });

  it("splits a string into plain + bold + plain", () => {
    expect(parseBoldSegments("hello **world** today")).toEqual([
      { text: "hello ", bold: false },
      { text: "world", bold: true },
      { text: " today", bold: false },
    ]);
  });

  it("handles multiple bold segments", () => {
    expect(parseBoldSegments("**a** and **b**")).toEqual([
      { text: "a", bold: true },
      { text: " and ", bold: false },
      { text: "b", bold: true },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseBoldSegments("")).toEqual([]);
  });

  it("treats unbalanced opening markers as plain text", () => {
    expect(parseBoldSegments("hello **world")).toEqual([{ text: "hello **world", bold: false }]);
  });

  it("treats unbalanced closing markers as plain text", () => {
    expect(parseBoldSegments("hello world**")).toEqual([{ text: "hello world**", bold: false }]);
  });

  it("handles bold segments at the very start and the very end", () => {
    expect(parseBoldSegments("**start** of the **string**")).toEqual([
      { text: "start", bold: true },
      { text: " of the ", bold: false },
      { text: "string", bold: true },
    ]);
  });

  it("gives the same answer when called again, as a shared pattern must", () => {
    expect(parseBoldSegments("**a** b")).toEqual(parseBoldSegments("**a** b"));
  });
});
