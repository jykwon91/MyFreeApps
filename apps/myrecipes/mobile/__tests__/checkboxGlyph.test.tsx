import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import { render, screen } from "@testing-library/react-native";
import CookIngredientList from "../src/features/cook/CookIngredientList";
import CompareCheckbox from "../src/features/versions/CompareCheckbox";

const GLYPH = "✓";

const FLOUR = { id: "i1", position: 0, name: "flour", quantity: 2, unit: "cup", note: null } as unknown as IngredientResponse;

function glyph() {
  return screen.getByText(GLYPH, { includeHiddenElements: true });
}

describe("checkbox tick", () => {
  it("cook list: the tick never grows with text size and is hidden from screen readers, while the row reports checked", async () => {
    await render(<CookIngredientList checked={["i1"]} ingredients={[FLOUR]} onToggle={() => {}} />);

    expect(glyph().props.maxFontSizeMultiplier).toBe(1);
    expect(screen.queryByText(GLYPH)).toBeNull();
    expect(screen.getByRole("checkbox", { checked: true })).toBeTruthy();
  });

  it("cook list: an unchecked row draws no tick and reports unchecked", async () => {
    await render(<CookIngredientList checked={[]} ingredients={[FLOUR]} onToggle={() => {}} />);

    expect(screen.queryByText(GLYPH, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole("checkbox", { checked: false })).toBeTruthy();
  });

  it("compare list: the tick never grows with text size and is hidden from screen readers", async () => {
    await render(<CompareCheckbox isChecked isDisabled={false} />);

    expect(glyph().props.maxFontSizeMultiplier).toBe(1);
    expect(screen.queryByText(GLYPH)).toBeNull();
  });
});
