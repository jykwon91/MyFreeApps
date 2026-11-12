import { codeOf, keyboardHandlingProblems } from "@platform/mobile/test-support/keyboardHandlingProblems";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("keyboard handling", () => {
  // Android draws edge to edge, so its window no longer shrinks for the keyboard, and the old
  // automaticallyAdjustKeyboardInsets only worked on iOS. New, edit, tweak and import all scroll in this layout.
  it("the recipe form keeps its fields above the keyboard with the shared keyboard-aware scroll view", () => {
    expect(codeOf(join(ROOT, "src", "features", "recipeForm", "RecipeFormLayout.tsx"))).toMatch(/<KeyboardAwareScroll[\s>]/);
  });

  it("nothing in the app leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(ROOT, ["src", "app"])).toEqual([]);
  });
});
