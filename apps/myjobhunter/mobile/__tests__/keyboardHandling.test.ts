import { codeOf, keyboardHandlingProblems } from "@platform/mobile/test-support/keyboardHandlingProblems";
import { join } from "path";

const ROOT = join(__dirname, "..");
const FEATURES = join(ROOT, "src", "features");

// Android draws edge to edge, so its window no longer shrinks for the keyboard, and the scroll views' old
// automaticallyAdjustKeyboardInsets only worked on iOS. These keep their fields above the keyboard on both.
const KEYBOARD_AWARE = [
  "addApplication/AddApplicationScreen",
  "addApplication/CompanyPickerSheet",
  "analyze/AnalyzeScreen",
  "resume/ResumeScroll",
];

describe("keyboard handling", () => {
  it.each(KEYBOARD_AWARE)("%s keeps its fields above the keyboard with the shared keyboard-aware scroll view", (feature) => {
    expect(codeOf(join(FEATURES, `${feature}.tsx`))).toMatch(/<KeyboardAwareScroll[\s/>]/);
  });

  it("nothing in the app leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(ROOT, ["src", "app"])).toEqual([]);
  });
});
