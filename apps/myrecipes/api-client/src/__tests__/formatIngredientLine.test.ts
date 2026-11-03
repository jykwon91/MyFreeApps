import { describe, expect, it } from "vitest";
import { formatIngredientLine } from "../utils/formatIngredientLine";

describe("formatIngredientLine", () => {
  it("joins quantity, unit, name and note", () => {
    expect(formatIngredientLine({ name: "flour", quantity: 2, unit: "cups", note: "sifted" })).toBe(
      "2 cups flour (sifted)",
    );
  });

  it("drops trailing zeros and rounds to two places", () => {
    expect(formatIngredientLine({ name: "salt", quantity: 0.5 })).toBe("0.5 salt");
    expect(formatIngredientLine({ name: "milk", quantity: 1.3333 })).toBe("1.33 milk");
  });

  it("keeps a quantity of zero and leaves out what's missing", () => {
    expect(formatIngredientLine({ name: "sugar", quantity: 0 })).toBe("0 sugar");
    expect(formatIngredientLine({ name: "pepper", quantity: null, unit: null, note: null })).toBe("pepper");
  });
});
