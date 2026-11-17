import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { render, screen } from "@testing-library/react-native";
import CookIngredientList from "../src/features/cook/CookIngredientList";
import RecipeIngredients from "../src/features/recipes/RecipeIngredients";

let mockDecimalSeparator: "." | "," = ",";
// deviceDecimalSeparator reads the device locale through this.
jest.mock("@platform/core/utils/localeDecimalSeparator", () => ({ localeDecimalSeparator: () => mockDecimalSeparator }));

const FLOUR = { id: "i1", position: 0, name: "flour", quantity: 1.5, unit: "cups", note: null } as IngredientResponse;

describe("ingredient quantities follow the device's decimal separator", () => {
  beforeEach(() => {
    mockDecimalSeparator = ",";
  });

  it("shows 1,5 in the recipe's ingredient list on a comma device", async () => {
    await render(<RecipeIngredients ingredients={[FLOUR]} />);
    expect(screen.getByText("1,5 cups flour")).toBeTruthy();
  });

  it("shows 1,5 in cook mode on a comma device", async () => {
    await render(<CookIngredientList checked={[]} ingredients={[FLOUR]} onToggle={jest.fn()} />);
    expect(screen.getByText("1,5 cups flour")).toBeTruthy();
    expect(screen.getByLabelText("1,5 cups flour")).toBeTruthy();
  });

  it("keeps the dot on a dot device", async () => {
    mockDecimalSeparator = ".";
    await render(<RecipeIngredients ingredients={[FLOUR]} />);
    expect(screen.getByText("1.5 cups flour")).toBeTruthy();
  });
});
