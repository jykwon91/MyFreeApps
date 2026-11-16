import { render, screen } from "@testing-library/react-native";
import { StyleSheet, useWindowDimensions } from "react-native";
import LabelValueRow from "../components/LabelValueRow";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function atFontScale(fontScale: number) {
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

function rowStyle() {
  return StyleSheet.flatten(screen.getByLabelText("Category, $1,200.00").props.style);
}

describe("LabelValueRow", () => {
  it("puts the label and value on one line at the default text size", async () => {
    atFontScale(1);
    await render(<LabelValueRow label="Category" value="$1,200.00" />);

    expect(rowStyle().flexDirection).toBe("row");
  });

  it("stacks the value under the label at a large text size", async () => {
    atFontScale(2);
    await render(<LabelValueRow label="Category" value="$1,200.00" />);

    expect(rowStyle().flexDirection).toBeUndefined();
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getByText("$1,200.00")).toBeTruthy();
  });

  it("reads the label and then the value to a screen reader", async () => {
    atFontScale(1);
    await render(<LabelValueRow label="Category" value="$1,200.00" />);

    expect(screen.getByLabelText("Category, $1,200.00")).toBeTruthy();
  });

  it("lets a long label shrink while the value keeps its size", async () => {
    atFontScale(1);
    await render(<LabelValueRow label="A very long category name" value="$1,200.00" />);

    expect(StyleSheet.flatten(screen.getByText("A very long category name").props.style).flexShrink).toBe(1);
    expect(StyleSheet.flatten(screen.getByText("$1,200.00").props.style).flexShrink).toBe(0);
  });

  it("lets a long value wrap when asked", async () => {
    atFontScale(1);
    await render(<LabelValueRow label="Note" value="A long note" valueWraps />);

    expect(StyleSheet.flatten(screen.getByText("A long note").props.style).flexShrink).toBe(1);
  });
});
