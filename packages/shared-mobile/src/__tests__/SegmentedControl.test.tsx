import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import SegmentedControl from "../components/SegmentedControl";
import { SEGMENT_ROLE } from "../constants/segmentRole";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const SEGMENTS = [
  { value: "one", label: "One" },
  { value: "two", label: "Two" },
] as const;

async function setup() {
  const onChange = jest.fn();
  await render(<SegmentedControl accessibilityLabel="Pick" onChange={onChange} segments={SEGMENTS} value="one" />);
  return onChange;
}

describe("SegmentedControl", () => {
  it("tells a screen reader which segment is selected", async () => {
    await setup();
    expect(screen.getByRole("tab", { name: "One", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Two", selected: false })).toBeTruthy();
  });

  it("reports the segment that was pressed", async () => {
    const onChange = await setup();
    fireEvent.press(screen.getByRole("tab", { name: "Two" }));
    expect(onChange).toHaveBeenCalledWith("two");
  });

  it("is big enough to tap", async () => {
    await setup();
    const style = StyleSheet.flatten(screen.getByRole("tab", { name: "One" }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("ignores presses and says so to a screen reader while disabled", async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl accessibilityLabel="Pick" disabled onChange={onChange} segments={SEGMENTS} value="one" />);
    const tab = screen.getByRole("tab", { name: "Two" });
    expect(tab.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(tab);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads as radios that pick a setting when asked to", async () => {
    await render(
      <SegmentedControl accessibilityLabel="Pick" onChange={jest.fn()} role={SEGMENT_ROLE.radio} segments={SEGMENTS} value="two" />,
    );
    // The group stays not-accessible itself, so a screen reader still reaches each radio inside it.
    expect(screen.getByLabelText("Pick").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getByRole("radio", { name: "Two", checked: true, selected: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "One", checked: false })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
