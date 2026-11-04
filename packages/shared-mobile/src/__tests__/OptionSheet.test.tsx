import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import OptionSheet from "../components/OptionSheet";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const OPTIONS = [
  { value: "oak", label: "Oak St" },
  { value: "elm", label: "Elm St" },
];

function sheet(onSelect = jest.fn(), onClose = jest.fn()) {
  return render(
    <OptionSheet isOpen onClose={onClose} onSelect={onSelect} options={OPTIONS} title="Property" value="elm" />,
  );
}

describe("OptionSheet", () => {
  it("says which option is chosen and reports the one tapped", async () => {
    const onSelect = jest.fn();
    await sheet(onSelect);

    expect(screen.getByRole("radio", { name: "Elm St" }).props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByRole("radio", { name: "Oak St" }).props.accessibilityState).toEqual({ checked: false });

    await fireEvent.press(screen.getByRole("radio", { name: "Oak St" }));
    expect(onSelect).toHaveBeenCalledWith("oak");
  });

  it("closes, with rows and a Close button big enough to tap", async () => {
    const onClose = jest.fn();
    await sheet(jest.fn(), onClose);

    const close = screen.getByRole("button", { name: "Close" });
    expect(StyleSheet.flatten(close.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    const row = StyleSheet.flatten(screen.getByRole("radio", { name: "Oak St" }).props.style);
    expect(row.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });

  it("says so when there is nothing to choose", async () => {
    await render(
      <OptionSheet emptyText="Add a property on the website first." isOpen onClose={jest.fn()} onSelect={jest.fn()} options={[]} title="Property" value={null} />,
    );
    expect(screen.getByText("Add a property on the website first.")).toBeTruthy();
  });
});
