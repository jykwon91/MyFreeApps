import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import SwitchRow from "../components/SwitchRow";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

describe("SwitchRow", () => {
  it("shows its label and note, and reports a flip", async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow label="Email" note="No email on file." onValueChange={onValueChange} value={false} />);

    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("No email on file.")).toBeTruthy();
    await fireEvent(screen.getByLabelText("Email"), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("reads its state to a screen reader", async () => {
    await render(<SwitchRow label="Email" onValueChange={jest.fn()} value />);
    expect(screen.getByLabelText("Email").props.value).toBe(true);
  });

  it("can be switched off for good, with the reason beside it", async () => {
    await render(<SwitchRow disabled label="Text" note="Not set up." onValueChange={jest.fn()} value={false} />);
    expect(screen.getByLabelText("Text").props.disabled).toBe(true);
  });

  it("is a full touch target tall", async () => {
    await render(<SwitchRow label="Email" onValueChange={jest.fn()} value />);
    const row = screen.getByText("Email").parent?.parent;
    expect(StyleSheet.flatten(row?.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
