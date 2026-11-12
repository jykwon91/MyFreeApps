import { render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import HeaderKeyboardAvoidingView from "../components/HeaderKeyboardAvoidingView";

const mockHeaderHeight = 96;

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => mockHeaderHeight }));
jest.mock("react-native/Libraries/Components/Keyboard/KeyboardAvoidingView", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: unknown } & Record<string, unknown>) => (
      <View {...props} testID="keyboard-avoiding-view">
        {children as never}
      </View>
    ),
  };
});

async function renderBar(): Promise<void> {
  await render(
    <HeaderKeyboardAvoidingView>
      <Text>Send</Text>
    </HeaderKeyboardAvoidingView>,
  );
}

describe("HeaderKeyboardAvoidingView", () => {
  const originalOs = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOs;
  });

  // The header sits between the view's frame in its parent and the keyboard's position on the screen, so
  // without its height as an offset the padding comes up short by that much and the pinned bar stays covered.
  it("pads on iOS, offset by the height of the header", async () => {
    Platform.OS = "ios";
    await renderBar();
    const view = screen.getByTestId("keyboard-avoiding-view");
    expect(view.props.behavior).toBe("padding");
    expect(view.props.keyboardVerticalOffset).toBe(mockHeaderHeight);
    expect(screen.getByText("Send")).toBeTruthy();
  });

  // Android is unchanged: its window's soft-input mode handles the keyboard, as before.
  it("leaves Android unchanged", async () => {
    Platform.OS = "android";
    await renderBar();
    expect(screen.getByTestId("keyboard-avoiding-view").props.behavior).toBeUndefined();
  });
});
