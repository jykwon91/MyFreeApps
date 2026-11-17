import { act, render, screen } from "@testing-library/react-native";
import ClampedText from "../components/ClampedText";
import { LARGE_TEXT_FONT_SCALE } from "../constants/largeText";
import { setFontScale } from "../../test-support/fontScale";

const NAME = "Northwest Plumbing and Heating Supply Company";

describe("ClampedText", () => {
  it("keeps the limit at the default text size", async () => {
    setFontScale(1);
    await render(<ClampedText numberOfLines={1}>{NAME}</ClampedText>);

    expect(screen.getByText(NAME).props.numberOfLines).toBe(1);
  });

  it("keeps the limit just below the large text threshold", async () => {
    setFontScale(LARGE_TEXT_FONT_SCALE - 0.01);
    await render(<ClampedText numberOfLines={2}>{NAME}</ClampedText>);

    expect(screen.getByText(NAME).props.numberOfLines).toBe(2);
  });

  it.each([LARGE_TEXT_FONT_SCALE, 2, 3.1])("shows the text whole at a text size of %s", async (scale) => {
    setFontScale(scale);
    await render(<ClampedText numberOfLines={1}>{NAME}</ClampedText>);

    expect(screen.getByText(NAME).props.numberOfLines).toBeUndefined();
  });

  it("uses the large text limit it is given, for a preview whose whole text is a tap away", async () => {
    setFontScale(2);
    await render(
      <ClampedText largeTextNumberOfLines={6} numberOfLines={2}>
        {NAME}
      </ClampedText>,
    );

    expect(screen.getByText(NAME).props.numberOfLines).toBe(6);
  });

  it("passes the rest on to the text and follows the text size as the person changes it", async () => {
    setFontScale(1);
    await render(
      <ClampedText ellipsizeMode="middle" numberOfLines={1} selectable style={{ fontSize: 14 }}>
        {NAME}
      </ClampedText>,
    );
    const text = screen.getByText(NAME);
    expect(text.props).toMatchObject({ ellipsizeMode: "middle", selectable: true, style: { fontSize: 14 } });

    await act(() => setFontScale(2));

    expect(screen.getByText(NAME).props.numberOfLines).toBeUndefined();
  });
});
