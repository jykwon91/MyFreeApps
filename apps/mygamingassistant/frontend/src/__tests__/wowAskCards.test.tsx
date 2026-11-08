import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AskErrorNotice from "@/games/wow-forever/components/ask/AskErrorNotice";
import DungeonCard from "@/games/wow-forever/components/ask/cards/DungeonCard";
import ItemsCard from "@/games/wow-forever/components/ask/cards/ItemsCard";
import NpcResultsCard from "@/games/wow-forever/components/ask/cards/NpcResultsCard";
import PlacesCard from "@/games/wow-forever/components/ask/cards/PlacesCard";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import type { AskNpcCard } from "@/games/wow-forever/types/ask/askNpcCard";
import { FIXTURE_FILE } from "./wowClientItemsFixture";
import { askToolData } from "./wowAskWorld";

async function desolaceCard(): Promise<AskNpcCard> {
  const out = await runAskTool(
    { type: "tool_use", id: "t", name: ASK_TOOL.searchNpcs, input: { query: "warlock trainer", from_zone: "Desolace" } },
    askToolData({ faction: "H" }),
  );
  if (out.card?.kind !== ASK_CARD.npcs) throw new Error("no card");
  return out.card;
}

function inRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

afterEach(() => vi.useRealTimers());

describe("NpcResultsCard", () => {
  it("numbers the results on the map, and Route there appears once a row is picked", async () => {
    const card = await desolaceCard();
    inRouter(<NpcResultsCard card={card} />);
    expect(screen.getByText(/Nearest to Desolace/)).toBeTruthy();
    expect(screen.getByRole("img", { name: `Map of ${card.rows[0].zoneName} with the results marked` })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Route there" })).toBeNull();

    const second = card.rows[1];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(second.name) }));
    expect(screen.getByRole("button", { name: new RegExp(second.name) }).getAttribute("aria-pressed")).toBe("true");
    const href = screen.getByRole("link", { name: "Route there" }).getAttribute("href");
    expect(href).toBe(`/wow-forever/map?to=npc%3A${second.poiId}&from=pt%3A1443%2C50.0%2C50.0&dir=1`);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(second.name) }));
    expect(screen.queryByRole("link", { name: "Route there" })).toBeNull();
  });

  it("marks only the rows on the shown zone, plus You when the start is on it", async () => {
    const card = await desolaceCard();
    const shownZone = card.rows[0].zoneId;
    const { container } = inRouter(<NpcResultsCard card={{ ...card, origin: { ...card.origin!, zoneId: shownZone } }} />);
    const onZone = card.rows.filter((r) => r.zoneId === shownZone).length;
    expect(container.querySelectorAll("[data-testid=ask-map-marker]")).toHaveLength(onZone);
    expect(container.querySelector("[data-testid=ask-map-you]")).not.toBeNull();
  });
});

describe("other cards", () => {
  it("places: a town routes there, a zone opens its map", () => {
    inRouter(
      <PlacesCard
        card={{
          kind: ASK_CARD.places,
          query: "booty",
          rows: [
            { placeId: "town-1434-booty bay", name: "Booty Bay", kind: "town", label: "Booty Bay, Stranglethorn Vale", zoneId: 1434, levels: "30–50" },
            { placeId: "zone-1434", name: "Stranglethorn Vale", kind: "zone", label: "Stranglethorn Vale", zoneId: 1434, levels: null },
          ],
        }}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/wow-forever/map?to=place%3Atown-1434-booty+bay&dir=1");
    expect(links[1].textContent).toBe("Show on the World Map");
    expect(links[1].getAttribute("href")).toBe("/wow-forever/map?m=1434");
  });

  it("dungeon: levels, bosses and its page", () => {
    inRouter(
      <DungeonCard
        card={{ kind: ASK_CARD.dungeon, slug: "deadmines", name: "Deadmines", levelMin: 16, levelMax: 16, requiredLevel: 10, zones: ["Westfall"], bosses: ["Sneed", "Edwin VanCleef"], matchedBoss: null }}
      />,
    );
    expect(screen.getByText(/Level 16 · Can enter from level 10 · Westfall/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Sneed", "Edwin VanCleef"]);
    expect(screen.getByRole("link", { name: "Open the dungeon page" }).getAttribute("href")).toBe("/wow-forever/dungeons/deadmines");
  });

  it("items link to their item pages", () => {
    const list = decodeClientItems(FIXTURE_FILE, []);
    const items = list.items.slice(0, 2);
    inRouter(<ItemsCard card={{ kind: ASK_CARD.items, query: "x", items, total: 5 }} />);
    expect(screen.getByRole("link", { name: items[0].name }).getAttribute("href")).toContain(String(items[0].id));
    expect(screen.getByText("3 more match — ask with a fuller name.")).toBeTruthy();
  });
});

describe("AskErrorNotice", () => {
  it("holds Try again back while Retry-After counts down", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(
      <AskErrorNotice failure={{ kind: ASK_FAILURE.rateLimited, retryAfterSeconds: 2, at: 0 }} onRetry={onRetry} onNewChat={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "Try again in 2 s" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(2100));
    const ready = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(ready);
    expect(onRetry).toHaveBeenCalled();
  });

  it("the daily cap has nothing to press; an expired chat offers New chat", () => {
    const { rerender } = render(
      <AskErrorNotice failure={{ kind: ASK_FAILURE.dailyLimit, retryAfterSeconds: 3600, at: 0 }} onRetry={vi.fn()} onNewChat={vi.fn()} />,
    );
    expect(screen.getByText(/answered all it can for today/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    const onNewChat = vi.fn();
    rerender(<AskErrorNotice failure={{ kind: ASK_FAILURE.chatOver, retryAfterSeconds: null, at: 1 }} onRetry={vi.fn()} onNewChat={onNewChat} />);
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNewChat).toHaveBeenCalled();
  });
});
