/**
 * Unit tests for DiscoveryCard — one candidate in the web-discovery grid.
 *
 * Two things here are load-bearing rather than cosmetic, and both are pinned:
 *   - the picture goes through OUR api (the app's CSP is `img-src 'self'`, so
 *     a third-party `<img src>` would be blocked outright), and a result with
 *     no picture still renders a card of the same shape;
 *   - opening a result is a callback, not a link — it costs a Claude call, so
 *     it must never be something a browser can prefetch or middle-click.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DiscoveryCard from "@/features/discovery/DiscoveryCard";
import type { DiscoveredRecipe } from "@/types/recipe/discovery";

function makeResult(overrides: Partial<DiscoveredRecipe> = {}): DiscoveredRecipe {
  return {
    id: "abc123",
    title: "Flan Napolitano",
    source_type: "website",
    site_name: "Serious Eats",
    url: "https://www.seriouseats.com/flan-napolitano",
    image_url: "/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=t",
    summary: "A cream-cheese-enriched flan with a dense, silky set.",
    why_notable: "The only version that water-baths at 325F.",
    total_minutes: 90,
    difficulty: "medium",
    ...overrides,
  };
}

function renderCard(recipe: DiscoveredRecipe, onOpen = vi.fn()) {
  render(<DiscoveryCard recipe={recipe} onOpen={onOpen} />);
  return onOpen;
}

describe("DiscoveryCard", () => {
  it("shows the title, publisher, summary and differentiator", () => {
    renderCard(makeResult());
    expect(screen.getByText("Flan Napolitano")).toBeInTheDocument();
    expect(screen.getByText("Serious Eats")).toBeInTheDocument();
    expect(screen.getByText(/dense, silky set/i)).toBeInTheDocument();
    expect(screen.getByText(/water-baths at 325F/i)).toBeInTheDocument();
  });

  it("labels the source type so the mix of sources is visible at a glance", () => {
    renderCard(makeResult({ source_type: "reddit", site_name: "r/Cooking" }));
    expect(screen.getByText("Reddit")).toBeInTheDocument();
  });

  it("falls back to the host when the model named no publisher", () => {
    renderCard(makeResult({ site_name: null }));
    expect(screen.getByText("seriouseats.com")).toBeInTheDocument();
  });

  it("formats total time the way a cook reads it", () => {
    renderCard(makeResult({ total_minutes: 90 }));
    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();
  });

  it("omits the time and difficulty row when the source stated neither", () => {
    renderCard(makeResult({ total_minutes: null, difficulty: null }));
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Easy|Medium|Involved)$/)).not.toBeInTheDocument();
  });

  it("loads the picture through our own api, never the third-party host", () => {
    renderCard(makeResult());
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "/api/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=t",
    );
  });

  it("renders a placeholder tile when the result has no picture", () => {
    renderCard(makeResult({ image_url: null }));
    expect(document.querySelector("img")).toBeNull();
    // The card still renders — a missing photo never costs us the result.
    expect(screen.getByText("Flan Napolitano")).toBeInTheDocument();
  });

  it("opens the result through the callback, not a link", async () => {
    const recipe = makeResult();
    const onOpen = renderCard(recipe);
    expect(screen.queryByRole("link")).toBeNull();

    await userEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(recipe);
  });
});
