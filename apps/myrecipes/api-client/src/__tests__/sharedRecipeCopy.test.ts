import { describe, expect, it } from "vitest";
import { RECIPE_CARD_COPY } from "../constants/recipeCardCopy";
import { DISCOVERY_RESULTS_SUMMARY } from "../constants/discoveryResultsSummary";
import { RECIPES_SEARCH_EMPTY_COPY } from "../constants/recipesSearchEmptyCopy";

describe("copy shared by the website and the phone", () => {
  it("words the last-cooked line from a date", () => {
    expect(RECIPE_CARD_COPY.lastCooked("Nov 11, 2026")).toBe("Last cooked Nov 11, 2026");
    expect(RECIPE_CARD_COPY.notCooked).toBe("Not cooked yet");
  });

  it("pluralises the discovery result count", () => {
    expect(DISCOVERY_RESULTS_SUMMARY.lead(1)).toBe("1 version of");
    expect(DISCOVERY_RESULTS_SUMMARY.lead(3)).toBe("3 versions of");
  });

  it("names the search term when nothing matches", () => {
    expect(RECIPES_SEARCH_EMPTY_COPY.body("zzz")).toBe('Nothing matches "zzz". Check the spelling or try a shorter word.');
  });
});
