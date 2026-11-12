import { emptyIngredientRow, emptyStepRow } from "@myrecipes/api-client/utils/emptyRecipeRows";
import { act, renderHook } from "@testing-library/react-native";
import { useState } from "react";
import { useRecipeRows } from "../src/features/recipeForm/useRecipeRows";
import type { RecipeRows } from "../src/types/RecipeRows";

const START: RecipeRows = {
  ingredients: [emptyIngredientRow("i1"), emptyIngredientRow("i2")],
  steps: [emptyStepRow("s1"), emptyStepRow("s2")],
};

function useRows() {
  const [values, setValues] = useState<RecipeRows>(START);
  return { values, rows: useRecipeRows(setValues) };
}

describe("moving recipe rows", () => {
  it("leaves the form exactly as it was when the first row moves up or the last row moves down", async () => {
    const { result } = await renderHook(() => useRows());

    await act(() => result.current.rows.moveIngredient("i1", -1));
    await act(() => result.current.rows.moveIngredient("i2", 1));
    await act(() => result.current.rows.moveStep("s1", -1));
    await act(() => result.current.rows.moveStep("s2", 1));

    // The same values, not a copy, so nothing counts as an unsaved change.
    expect(result.current.values).toBe(START);
  });

  it("still swaps rows that can move", async () => {
    const { result } = await renderHook(() => useRows());

    await act(() => result.current.rows.moveIngredient("i1", 1));
    await act(() => result.current.rows.moveStep("s2", -1));

    expect(result.current.values.ingredients.map((row) => row.key)).toEqual(["i2", "i1"]);
    expect(result.current.values.steps.map((row) => row.key)).toEqual(["s2", "s1"]);
  });
});
