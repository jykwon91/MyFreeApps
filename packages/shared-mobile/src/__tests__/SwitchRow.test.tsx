import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import SwitchRow from "../components/SwitchRow";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const innerSwitch = () => screen.getAllByRole("switch", { includeHiddenElements: true }).at(-1)!;

describe("SwitchRow", () => {
  it("is one switch element with its name, note as hint, and state", async () => {
    await render(<SwitchRow label="Email" note="No email on file." onValueChange={jest.fn()} value />);

    const rows = screen.getAllByRole("switch");
    expect(rows).toHaveLength(1);
    expect(screen.getByRole("switch", { name: "Email" })).toBeTruthy();
    expect(rows[0].props.accessibilityHint).toBe("No email on file.");
    expect(rows[0].props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(screen.getByText("No email on file.")).toBeTruthy();
  });

  it("hides the inner switch from screen readers", async () => {
    await render(<SwitchRow label="Email" onValueChange={jest.fn()} value={false} />);
    const inner = innerSwitch();
    expect(inner.props.accessibilityElementsHidden).toBe(true);
    expect(inner.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("flips once when the row is pressed", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Email" onValueChange={onValueChange} value={false} />);
    await fireEvent.press(screen.getByRole("switch", { name: "Email" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("flips off when pressed while on", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Email" onValueChange={onValueChange} value />);
    await fireEvent.press(screen.getByText("Email"));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("reports a direct flip of the switch once", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Email" onValueChange={onValueChange} value={false} />);
    await fireEvent(innerSwitch(), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("does not flip when disabled", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow disabled label="Text" note="Not set up." onValueChange={onValueChange} value={false} />);
    const row = screen.getByRole("switch", { name: "Text" });
    expect(row.props.accessibilityState).toEqual({ checked: false, disabled: true });
    await fireEvent.press(row);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(innerSwitch().props.disabled).toBe(true);
  });

  it("is a full touch target tall", async () => {
    await render(<SwitchRow label="Email" onValueChange={jest.fn()} value />);
    const row = screen.getByRole("switch", { name: "Email" });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
