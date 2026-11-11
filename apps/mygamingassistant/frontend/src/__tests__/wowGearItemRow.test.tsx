import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GearItemRow from "@/games/wow-forever/components/gear/GearItemRow";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";
import { iconSources, itemIconFile } from "./wowIconFiles";

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
  availableFromEstimated: false,
};

function render(ui: ReactElement) {
  return rtlRender(<MemoryRouter initialEntries={["/wow-forever/gear?class=mage"]}>{ui}</MemoryRouter>);
}

describe("GearItemRow", () => {
  it("links the item name to its own item page, never to Wowhead", () => {
    render(<GearItemRow ranked={RANKED} isTop={false} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Robe of the Archmage");
    expect(links[0]).toHaveAttribute("href", "/wow-forever/items/14152");
  });

  it("shows level, percent, score, source chip and badges", () => {
    render(<GearItemRow ranked={RANKED} isTop={false} />);
    expect(screen.getByText("Req. level 57")).toBeInTheDocument();
    expect(screen.getByText("96% of top pick · score 41.2")).toBeInTheDocument();
    expect(screen.getByTestId("gear-source-chip")).toHaveTextContent("Crafted");
    expect(screen.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");
    expect(screen.getByText("Tailoring 300")).toBeInTheDocument();
    expect(screen.getByText("Honored with Argent Dawn")).toBeInTheDocument();
    expect(screen.getByText("Binds when picked up")).toBeInTheDocument();
  });

  it("says when an item has no known source", () => {
    render(<GearItemRow ranked={{ ...RANKED, sources: [], availableFrom: 60 }} isTop />);
    expect(screen.getByTestId("gear-source-chip")).toHaveTextContent("Source unknown");
    expect(screen.queryByTestId("provenance-badge")).not.toBeInTheDocument();
    expect(screen.getByText("Req. level 57 · get it from level 60")).toBeInTheDocument();
    expect(screen.getByText(/Top pick/)).toBeInTheDocument();
  });

  it("shows estimated availability as 'probably from about level N'", () => {
    const estimated: RankedGearItem = {
      ...RANKED,
      item: { ...RANKED.item, requiredLevel: 1, itemLevel: 43 },
      sources: [],
      availableFrom: 38,
      availableFromEstimated: true,
    };
    render(<GearItemRow ranked={estimated} isTop />);
    expect(screen.getByText("Probably from about level 38")).toBeInTheDocument();
  });

  it("shows 'Top pick · known source' when close rule applied", () => {
    render(<GearItemRow ranked={RANKED} isTop closeRuleApplied />);
    expect(screen.getByText(/Top pick · known source/)).toBeInTheDocument();
  });
});

describe("GearItemRow icon", () => {
  it("shows the item's in-game icon before its name", () => {
    render(<GearItemRow ranked={RANKED} isTop={false} />);
    expect(screen.getAllByTestId("game-icon").length).toBeGreaterThan(0);
    expect(iconSources()[0]).toContain(`/${itemIconFile(14152)}.webp`);
  });
});
