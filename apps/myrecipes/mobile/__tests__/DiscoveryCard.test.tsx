import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { LARGE_TEXT_PREVIEW_LINES } from "@platform/mobile";
import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import DiscoveryCard from "../src/features/discovery/DiscoveryCard";

const RECIPE: DiscoveredRecipe = {
  id: "flan1",
  title: "Flan Napolitano with Cream Cheese, Condensed Milk and a Dark Caramel Top",
  source_type: "website",
  site_name: "Serious Eats",
  url: "https://www.seriouseats.com/flan-napolitano",
  image_url: null,
  summary: "A cream-cheese-enriched flan with a dense, silky set that slices cleanly and keeps for days in the fridge.",
  why_notable: "The only version that water-baths at 325F, so the custard sets without bubbles.",
  total_minutes: 90,
  difficulty: "hard",
};

async function showCard(): Promise<void> {
  await render(<DiscoveryCard onPress={() => {}} recipe={RECIPE} />);
}

describe("DiscoveryCard text size", () => {
  it("keeps the title, summary and note to two lines each at the default text size", async () => {
    await showCard();

    expect(screen.getByText(RECIPE.title).props.numberOfLines).toBe(2);
    expect(screen.getByText(RECIPE.summary).props.numberOfLines).toBe(2);
    expect(screen.getByText(RECIPE.why_notable!).props.numberOfLines).toBe(2);
    expect(screen.getByText(RECIPE.site_name!).props.numberOfLines).toBe(1);
  });

  it("shows the whole title and publisher, and more of the summary and note, at a large text size", async () => {
    setFontScale(2);
    await showCard();

    expect(screen.getByText(RECIPE.title).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(RECIPE.site_name!).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(RECIPE.summary).props.numberOfLines).toBe(LARGE_TEXT_PREVIEW_LINES);
    expect(screen.getByText(RECIPE.why_notable!).props.numberOfLines).toBe(LARGE_TEXT_PREVIEW_LINES);
  });
});
