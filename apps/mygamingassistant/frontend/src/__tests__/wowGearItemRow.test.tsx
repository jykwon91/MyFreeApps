import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GearItemRow from "@/games/wow-forever/components/gear/GearItemRow";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

const RANKED: RankedGearItem = {
  item: {
    id: 14152,
    name: "Robe of the Archmage",
    quality: "epic",
    slot: "chest",
    itemType: "Cloth",
    itemLevel: 62,
    requiredLevel: 57,
    armor: 96,
    weapon: null,
    stats: { intellect: 12 },
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
  },
  score: 41.24,
  pctOfBest: 96.4,
  sources: [{ kind: "crafted", profession: "Tailoring", skill: 300 }],
  facts: { requires: null, reputation: { faction: "Argent Dawn", rank: "Honored" }, pvp: false, bindOnPickup: true },
  availableFrom: 57,
};

describe("GearItemRow", () => {
  it("links the item to Wowhead Forever in a new tab", () => {
    render(<GearItemRow ranked={RANKED} isTop={false} />);
    const link = screen.getByRole("link", { name: /Robe of the Archmage \(Epic\) on Wowhead/ });
    expect(link).toHaveAttribute("href", "https://www.wowhead.com/forever/item=14152");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows level, percent, score, source chip and badges", () => {
    render(<GearItemRow ranked={RANKED} isTop={false} />);
    expect(screen.getByText("Req. level 57")).toBeInTheDocument();
    expect(screen.getByText("96% of top pick · score 41.2")).toBeInTheDocument();
    expect(screen.getByTestId("gear-source-chip")).toHaveTextContent("Crafted (game files)");
    expect(screen.getByText("Tailoring 300")).toBeInTheDocument();
    expect(screen.getByText("Honored with Argent Dawn")).toBeInTheDocument();
    expect(screen.getByText("Binds when picked up")).toBeInTheDocument();
  });

  it("says when an item has no known source", () => {
    render(<GearItemRow ranked={{ ...RANKED, sources: [], availableFrom: 60 }} isTop />);
    expect(screen.getByTestId("gear-source-chip")).toHaveTextContent("Source unknown");
    expect(screen.getByText("Req. level 57 · get it from level 60")).toBeInTheDocument();
    expect(screen.getByText(/Top pick/)).toBeInTheDocument();
  });
});
