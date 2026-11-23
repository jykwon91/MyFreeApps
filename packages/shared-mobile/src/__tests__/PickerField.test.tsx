import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import PickerField from "../components/PickerField";
import { lightColors } from "../theme/colors";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

async function setup(props: { disabled?: boolean; hint?: string; error?: string } = {}) {
  const onPress = jest.fn();
  await render(<PickerField label="Category" onPress={onPress} valueLabel="Plumber" {...props} />);
  return onPress;
}

describe("PickerField", () => {
  it("reads out the label with what is chosen", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Category, Plumber" })).toBeTruthy();
  });

  it("opens the choices when pressed", async () => {
    const onPress = await setup();
    fireEvent.press(screen.getByRole("button", { name: "Category, Plumber" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the hint under the field", async () => {
    await setup({ hint: "Pick the trade." });
    expect(screen.getByText("Pick the trade.")).toBeTruthy();
  });

  it("has no error wording in its name when there is no error", async () => {
    await setup({ hint: "Pick the trade." });
    expect(screen.getByRole("button", { name: "Category, Plumber" }).props.accessibilityLabel).not.toMatch(/error/i);
  });

  it("reads the error in the name, keeps the hint, shows the hint only once, and outlines the field in the error colour", async () => {
    await setup({ hint: "Pick the trade.", error: "Choose a category." });
    const field = screen.getByRole("button", { name: "Category, Plumber, error: Choose a category." });
    expect(field.props.accessibilityHint).toBe("Pick the trade.");
    expect(screen.queryByText("Pick the trade.")).toBeNull();
    const { style } = field.props;
    expect(StyleSheet.flatten(typeof style === "function" ? style({ pressed: false }) : style).borderColor).toBe(lightColors.destructiveText);
  });

  it("does nothing while disabled", async () => {
    const onPress = await setup({ disabled: true });
    fireEvent.press(screen.getByRole("button", { name: "Category, Plumber" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("is big enough to tap", async () => {
    await setup();
    const style = StyleSheet.flatten(screen.getByRole("button", { name: "Category, Plumber" }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("outlines the field in a colour that can be seen against the background", async () => {
    await setup();

    const { style } = screen.getByRole("button", { name: "Category, Plumber" }).props;
    expect(StyleSheet.flatten(typeof style === "function" ? style({ pressed: false }) : style).borderColor).toBe(
      lightColors.inputBorder,
    );
  });
});
