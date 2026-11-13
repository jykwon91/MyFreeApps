import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { fireEvent, render, screen } from "@testing-library/react-native";
import RecipeCard from "../src/features/recipes/RecipeCard";

const RECIPE: RecipeSummary = {
  id: "r1",
  title: "Tomato soup",
  description: "Weeknight soup",
  source: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  version_count: 3,
  latest_version_number: 3,
  best_rating: 4,
  last_cooked_at: "2026-11-11T12:00:00Z",
  is_owner: true,
  owner_display_name: "Sam",
};

function show(overrides: Partial<RecipeSummary> = {}, onPress = () => {}) {
  return render(<RecipeCard onPress={onPress} recipe={{ ...RECIPE, ...overrides }} />);
}

describe("RecipeCard", () => {
  it("shows the version badge, best rating as stars, and when it was last cooked", async () => {
    await show();

    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("★★★★☆")).toBeTruthy();
    expect(screen.getByLabelText("best rating 4 out of 5")).toBeTruthy();
    expect(screen.getByText(/^Last cooked Nov 11, 2026$/)).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Tomato soup, v3, 3 versions, best rating 4 out of 5, Last cooked Nov 11, 2026, by Sam",
      }),
    ).toBeTruthy();
  });

  it("says Not cooked yet, with a dash for no rating, for an owner's untouched recipe", async () => {
    await show({ best_rating: null, last_cooked_at: null });

    expect(screen.getByText("Not cooked yet")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByLabelText("No rating")).toBeTruthy();
  });

  it("badges a recipe with no version as Draft, and leaves out the version count", async () => {
    await show({ latest_version_number: null, version_count: 0 });

    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.queryByText(/version/)).toBeNull();
  });

  it("keeps cook history private for other people's recipes", async () => {
    await show({ is_owner: false, best_rating: null, last_cooked_at: null });

    expect(screen.queryByText("Not cooked yet")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText("by Sam")).toBeTruthy();
  });

  it("opens the recipe when pressed", async () => {
    const onPress = jest.fn();
    await show({}, onPress);

    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
