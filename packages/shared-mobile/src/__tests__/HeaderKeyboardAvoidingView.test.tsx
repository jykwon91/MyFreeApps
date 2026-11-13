import { render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import HeaderKeyboardAvoidingView from "../components/HeaderKeyboardAvoidingView";

async function renderBar(): Promise<void> {
  await render(
    <HeaderKeyboardAvoidingView>
      <Text>Send</Text>
    </HeaderKeyboardAvoidingView>,
  );
}

// The keyboard controller's avoiding view renders as a View given its props under Jest.
function avoidingView() {
  return screen.getByText("Send").parent!;
}

describe("HeaderKeyboardAvoidingView", () => {
  const originalOs = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOs;
  });

  // Without its real position in the window, the view takes its top to be the screen's, so the padding comes up
  // short by the header above it and the pinned bar stays covered. Android draws edge to edge, so its window no
  // longer shrinks for the keyboard: it needs the same padding.
  it.each(["ios", "android"] as const)("pads on %s, measured from where it sits in the window", async (os) => {
    Platform.OS = os;
    await renderBar();
    const view = avoidingView();
    expect(view.props.behavior).toBe("padding");
    expect(view.props.automaticOffset).toBe(true);
    // The measured position already counts the header; an offset on top would pad by it twice.
    expect(view.props.keyboardVerticalOffset).toBeUndefined();
    expect(view.props.style).toEqual({ flex: 1 });
  });
});
