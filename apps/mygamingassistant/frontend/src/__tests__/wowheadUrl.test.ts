import { describe, expect, it } from "vitest";
import { wowheadForeverItemUrl, wowheadForeverSpellUrl } from "@/games/wow-forever/lib/wowheadUrl";

describe("wowheadUrl", () => {
  it("builds an item URL from an item id", () => {
    expect(wowheadForeverItemUrl(249399)).toBe("https://www.wowhead.com/forever/item=249399");
  });

  it("builds a spell URL from a spell id", () => {
    expect(wowheadForeverSpellUrl(1317279)).toBe("https://www.wowhead.com/forever/spell=1317279");
  });

  it("builds URLs for typical Forever item id ranges", () => {
    expect(wowheadForeverItemUrl(100000)).toBe("https://www.wowhead.com/forever/item=100000");
    expect(wowheadForeverItemUrl(284871)).toBe("https://www.wowhead.com/forever/item=284871");
  });

  it("builds a spell URL for a transmute recipe spell", () => {
    // Transmute: Legionite spell id used in the crafting guide tests.
    expect(wowheadForeverSpellUrl(1317279)).toBe("https://www.wowhead.com/forever/spell=1317279");
  });
});
