import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { LARGE_TEXT_FONT_SCALE } from "../constants/largeText";
import { useLargeText } from "../hooks/useLargeText";
import { setFontScale } from "../../test-support/fontScale";

function Probe() {
  return <Text>{useLargeText() ? "large" : "normal"}</Text>;
}

describe("useLargeText", () => {
  it("is off at the default text size", async () => {
    await render(<Probe />);

    expect(screen.getByText("normal")).toBeTruthy();
  });

  it("is off just below the threshold", async () => {
    setFontScale(LARGE_TEXT_FONT_SCALE - 0.01);
    await render(<Probe />);

    expect(screen.getByText("normal")).toBeTruthy();
  });

  it.each([LARGE_TEXT_FONT_SCALE, 2, 3.1])("is on at a text size of %s", async (scale) => {
    setFontScale(scale);
    await render(<Probe />);

    expect(screen.getByText("large")).toBeTruthy();
  });

  it("follows the text size when the person changes it", async () => {
    await render(<Probe />);

    await act(() => setFontScale(2));

    expect(screen.getByText("large")).toBeTruthy();
  });
});
