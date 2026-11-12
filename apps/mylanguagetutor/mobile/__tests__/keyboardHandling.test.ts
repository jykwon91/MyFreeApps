import { codeOf, keyboardHandlingProblems } from "@platform/mobile/test-support/keyboardHandlingProblems";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("keyboard handling", () => {
  // The reply box is pinned below the conversation, so the shared avoiding view lifts it, on Android as well as iOS.
  it("the conversation lifts its reply box above the keyboard", () => {
    const source = codeOf(join(ROOT, "src", "features", "conversation", "Conversation.tsx"));
    expect(source).toMatch(/<HeaderKeyboardAvoidingView[\s>]/);
    // Padded for the home indicator while the keyboard is up, it would float that far above the keyboard.
    expect(source).toMatch(/<PinnedBar[\s>]/);
  });

  it("nothing in the app leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(ROOT, ["src", "app"])).toEqual([]);
  });
});
