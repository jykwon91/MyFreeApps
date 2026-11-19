import { describe, expect, it } from "vitest";
import { matchesSearch } from "@/games/wow-forever/lib/professionTiers/matchesSearch";
import { professionEmptyMessage } from "@/games/wow-forever/lib/professionTiers/professionEmptyMessage";

describe("matchesSearch", () => {
  const hay = ["Waylaid Crate: Expert Cloth", "Silk Cloth"];

  it("ignores case and surrounding space", () => {
    expect(matchesSearch(hay, "  SILK ")).toBe(true);
    expect(matchesSearch(hay, "silk cloth")).toBe(true);
  });

  it("matches a substring", () => {
    expect(matchesSearch(hay, "ilk clo")).toBe(true);
    expect(matchesSearch(hay, "wool")).toBe(false);
  });

  it("needs every word, each in any haystack", () => {
    expect(matchesSearch(hay, "expert silk")).toBe(true);
    expect(matchesSearch(hay, "expert wool")).toBe(false);
  });

  it("matches everything for an empty or blank query", () => {
    expect(matchesSearch(hay, "")).toBe(true);
    expect(matchesSearch(hay, "   ")).toBe(true);
    expect(matchesSearch([], "")).toBe(true);
    expect(matchesSearch([], "a")).toBe(false);
  });
});

describe("professionEmptyMessage", () => {
  it("names the search when there is one", () => {
    expect(professionEmptyMessage("writs", "")).toBe("No writs match these filters");
    expect(professionEmptyMessage("writs", "xyz")).toBe("No writs match \u201Cxyz\u201D.");
  });
});
