import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import CookSheet from "../src/features/cook/CookSheet";

jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const LONG_TITLE = "Grandmother's slow-braised short ribs with red wine, shallots and roasted root vegetables";

async function renderSheet() {
  const onClose = jest.fn();
  await render(
    <CookSheet isAnimated={false} onClose={onClose} testID="sheet" title={LONG_TITLE}>
      <Text>body</Text>
    </CookSheet>,
  );
  return onClose;
}

describe("CookSheet header at large text sizes", () => {
  it("lets a long title wrap and shrink so Close stays on screen", async () => {
    await renderSheet();

    const title = screen.getByRole("header");
    const style = StyleSheet.flatten(title.props.style);

    expect(title.props.adjustsFontSizeToFit).toBeFalsy();
    expect(title.props.numberOfLines).toBeUndefined();
    expect(style.flexShrink).toBe(1);
    expect(style.flex).toBe(1);
  });

  it("keeps Close pressable", async () => {
    const onClose = await renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
