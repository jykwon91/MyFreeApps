import { describe, expect, it } from "vitest";
import { draftBlocks } from "../utils/draftBlocks";
import { draftLineMatches } from "../utils/draftLineMatches";
import { inlineSpans } from "../utils/inlineSpans";
import { plainDraftText } from "../utils/plainDraftText";

const DRAFT = ["# Ada Lovelace", "ada@example.com", "", "## Experience", "### Engineer", "- **Built** APIs", "- Led a team", "Shipped things", "## Skills", "- Go"].join("\n");

describe("draftBlocks", () => {
  it("groups headings, paragraphs and bullet lists, keeping each line's section", () => {
    const blocks = draftBlocks(DRAFT, null, true);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "heading", "heading", "list", "paragraph", "heading", "list"]);
    const list = blocks[4];
    expect(list.kind === "list" && list.items.map((item) => [item.text, item.section])).toEqual([
      ["**Built** APIs", "Experience"],
      ["Led a team", "Experience"],
    ]);
    const last = blocks[7];
    expect(last.kind === "list" && last.items[0].section).toBe("Skills");
  });

  it("lets only lines after the first section be picked, never headings or the highlighted line", () => {
    const blocks = draftBlocks(DRAFT, "Built APIs", true);
    const preamble = blocks[1];
    expect(preamble.kind === "paragraph" && preamble.line.pickable).toBe(false);
    const heading = blocks[3];
    expect(heading.kind === "heading" && heading.line.pickable).toBe(false);
    const list = blocks[4];
    expect(list.kind === "list" && list.items.map((item) => [item.highlight, item.pickable])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("picks nothing when picking is off", () => {
    const pickable = draftBlocks(DRAFT, null, false).flatMap((block) => (block.kind === "list" ? block.items : [block.line]));
    expect(pickable.some((line) => line.pickable)).toBe(false);
  });
});

describe("draftLineMatches", () => {
  it("matches with or without markdown marks, and never on a blank needle", () => {
    expect(draftLineMatches("**Built** APIs", "Built APIs")).toBe(true);
    expect(draftLineMatches("Led a team", "Built")).toBe(false);
    expect(draftLineMatches("Led a team", "  ")).toBe(false);
    expect(draftLineMatches("Led a team", null)).toBe(false);
  });
});

describe("inlineSpans", () => {
  it("splits bold, italic and plain runs, leaving an unclosed mark as text", () => {
    expect(inlineSpans("a **b** *c* d")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " d" },
    ]);
    expect(inlineSpans("5 * 3")).toEqual([{ text: "5 * 3" }]);
  });
});

describe("plainDraftText", () => {
  it("drops the marks and the outer spaces", () => {
    expect(plainDraftText(" **Built** *APIs* ")).toBe("Built APIs");
  });
});
