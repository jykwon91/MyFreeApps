/** The guide tools' cards, built from real tool runs. */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GoldCard from "@/games/wow-forever/components/ask/cards/GoldCard";
import MacrosCard from "@/games/wow-forever/components/ask/cards/MacrosCard";
import ProfessionCard from "@/games/wow-forever/components/ask/cards/ProfessionCard";
import RaresCard from "@/games/wow-forever/components/ask/cards/RaresCard";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";
import { askToolData } from "./wowAskWorld";
import { iconSources } from "./wowIconFiles";

async function cardFor<K extends AskCard["kind"]>(
  kind: K,
  name: AskToolName,
  input: Record<string, unknown>,
): Promise<Extract<AskCard, { kind: K }>> {
  const out = await runAskTool({ type: "tool_use", id: "t", name, input }, askToolData({ level: 30 }));
  if (out.card?.kind !== kind) throw new Error(`expected a ${kind} card`);
  return out.card as Extract<AskCard, { kind: K }>;
}

function inRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("RaresCard", () => {
  it("numbers the rares on the map; picking one offers Route there and Show on the World Map", async () => {
    const card = await cardFor(ASK_CARD.rares, ASK_TOOL.findRares, { zone: "Ashenvale" });
    const { container } = inRouter(<RaresCard card={card} />);
    expect(screen.getByRole("region", { name: "Rares for level 30" })).toBeTruthy();
    expect(screen.getByText(/Near Ashenvale/)).toBeTruthy();
    const onZone = card.rows.filter((r) => r.zoneId === card.rows[0].zoneId).length;
    // Spots that would overlap share one pin with a count (×3); every spot on the zone is on the map.
    const singles = container.querySelectorAll("[data-testid=ask-map-marker]").length;
    const grouped = [...container.querySelectorAll("[data-testid=ask-map-cluster]")].reduce(
      (sum, pin) => sum + Number(pin.textContent?.replace("×", "")),
      0,
    );
    expect(singles + grouped).toBe(onZone);
    expect(screen.queryByRole("link", { name: "Route there" })).toBeNull();

    const first = card.rows[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(first.name) }));
    const route = screen.getByRole("link", { name: "Route there" }).getAttribute("href");
    expect(route).toMatch(new RegExp(`^/wow-forever/map\\?to=pt%3A${first.zoneId}%2C`));
    expect(route).toMatch(/&from=pt%3A/);
    expect(route).toMatch(/&dir=1$/);
    expect(screen.getByRole("link", { name: "Show on the World Map" }).getAttribute("href")).toBe(first.mapHref);
    expect(screen.getByRole("link", { name: "Open the Rares list" }).getAttribute("href")).toBe(card.pageHref);
  });
});

describe("GoldCard", () => {
  it("shows the tips, the spots and that gold an hour is at vendor prices", async () => {
    const card = await cardFor(ASK_CARD.gold, ASK_TOOL.goldFarming, { level: 40 });
    inRouter(<GoldCard card={card} />);
    expect(screen.getByRole("region", { name: "Making gold at level 40" })).toBeTruthy();
    expect(screen.getByText(card.tips[0].title)).toBeTruthy();
    expect(screen.getByText(/at vendor prices/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(card.rows[0].name) }));
    expect(screen.getByRole("link", { name: "Route there" }).getAttribute("href")).toMatch(/^\/wow-forever\/map\?to=pt%3A/);
    expect(screen.getByRole("link", { name: "Open Making gold" }).getAttribute("href")).toBe("/wow-forever/gold#farm");
  });
});

describe("ProfessionCard", () => {
  it("lists the route's next steps and links to the guide", async () => {
    const card = await cardFor(ASK_CARD.profession, ASK_TOOL.professionGuide, { profession: "tailoring", skill: 150 });
    inRouter(<ProfessionCard card={card} />);
    expect(screen.getByRole("region", { name: "Tailoring from skill 150" })).toBeTruthy();
    expect(screen.getByText(card.rows[0].name)).toBeTruthy();
    const first = card.rows[0].icon;
    expect(first).not.toBeNull();
    expect(iconSources()[0]).toContain(`/${first?.fileDataId}.webp`);
    expect(screen.getByText(/cheapest route from auction prices/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the Tailoring guide" }).getAttribute("href")).toBe(
      "/wow-forever/professions?p=tailoring&skill=150",
    );
  });

  it("says when the skill is past the route", async () => {
    const card = await cardFor(ASK_CARD.profession, ASK_TOOL.professionGuide, { profession: "mining", skill: 300 });
    inRouter(<ProfessionCard card={card} />);
    expect(screen.getByText("You're past the end of the site's route.")).toBeTruthy();
  });
});

describe("MacrosCard", () => {
  it("shows each macro's text with a Copy button, and links to the class's macros", async () => {
    const card = await cardFor(ASK_CARD.macros, ASK_TOOL.findMacros, { class: "warlock", query: "pet" });
    inRouter(<MacrosCard card={card} />);
    expect(screen.getAllByTestId("macro-text")).toHaveLength(card.macros.length);
    expect(screen.getByText(card.macros[0].title)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /copy/i }).length).toBe(card.macros.length);
    expect(screen.getByRole("link", { name: "Open Macros" }).getAttribute("href")).toBe("/wow-forever/macros?class=warlock");
  });
});
