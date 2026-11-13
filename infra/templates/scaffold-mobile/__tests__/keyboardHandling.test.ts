import { keyboardHandlingProblems } from "@platform/mobile/test-support/keyboardHandlingProblems";
import { join } from "path";

// Android draws edge to edge, so its window no longer shrinks for the keyboard: a form scrolls in
// KeyboardAwareScroll, and a bar pinned under a header sits in HeaderKeyboardAvoidingView.
describe("keyboard handling", () => {
  it("nothing in the app leaves a field under the keyboard on Android", () => {
    expect(keyboardHandlingProblems(join(__dirname, ".."), ["src", "app"])).toEqual([]);
  });
});
