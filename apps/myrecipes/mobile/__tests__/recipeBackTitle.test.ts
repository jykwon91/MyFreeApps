import { recipeBackTitle } from "../src/utils/recipeBackTitle";

describe("recipeBackTitle", () => {
  it("names Back for a known entry point, and Recipes for anything else", () => {
    expect(recipeBackTitle("discover")).toBe("Discover");
    expect(recipeBackTitle(undefined)).toBe("Recipes");
    expect(recipeBackTitle("nowhere")).toBe("Recipes");
  });

  it("doesn't take a key from the object's prototype", () => {
    expect(recipeBackTitle("constructor")).toBe("Recipes");
    expect(recipeBackTitle("toString")).toBe("Recipes");
    expect(recipeBackTitle("__proto__")).toBe("Recipes");
  });
});
