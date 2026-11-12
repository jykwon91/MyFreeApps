import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import SearchField from "../components/SearchField";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const LABEL = "Search recipes by title";

function setup(value: string) {
  const onChangeText = jest.fn();
  const onClear = jest.fn();
  const view = render(
    <SearchField
      accessibilityLabel={LABEL}
      onChangeText={onChangeText}
      onClear={onClear}
      placeholder="Search recipes"
      value={value}
    />,
  );
  return { view, onChangeText, onClear };
}

describe("SearchField", () => {
  it("reports typing and meets the minimum touch target", async () => {
    const { view, onChangeText } = setup("");
    await view;
    const input = screen.getByLabelText(LABEL);

    expect(StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.changeText(input, "soup");
    expect(onChangeText).toHaveBeenCalledWith("soup");
  });

  it("offers a clear button only when there's text", async () => {
    await setup("").view;
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears through a target large enough to tap", async () => {
    const { view, onClear } = setup("soup");
    await view;
    const clear = screen.getByRole("button", { name: "Clear search" });

    expect(StyleSheet.flatten(clear.props.style).minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("runs a search from the keyboard's Search key when asked to, and caps the length", async () => {
    const onSubmit = jest.fn();
    await render(
      <SearchField
        accessibilityLabel={LABEL}
        maxLength={200}
        onChangeText={jest.fn()}
        onClear={jest.fn()}
        onSubmit={onSubmit}
        placeholder="Search recipes"
        value="soup"
      />,
    );
    const input = screen.getByLabelText(LABEL);

    expect(input.props.maxLength).toBe(200);
    await fireEvent(input, "submitEditing");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("can be locked, with no clear button, while a search runs", async () => {
    await render(
      <SearchField
        accessibilityLabel={LABEL}
        editable={false}
        onChangeText={jest.fn()}
        onClear={jest.fn()}
        placeholder="Search recipes"
        value="soup"
      />,
    );
    expect(screen.getByLabelText(LABEL).props.editable).toBe(false);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });
});
