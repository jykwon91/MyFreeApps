import { type ComponentRef, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet, Text, TextInput } from "react-native";
import FormField from "../components/FormField";
import { lightColors } from "../theme/colors";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

describe("FormField", () => {
  it("labels the input and meets the minimum touch target", async () => {
    await render(<FormField label="Email" />);

    const input = screen.getByLabelText("Email");
    expect(StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("passes input props through and reports changes", async () => {
    const onChangeText = jest.fn();
    await render(
      <FormField keyboardType="email-address" label="Email" onChangeText={onChangeText} value="a" />,
    );
    const input = screen.getByLabelText("Email");

    expect(input.props.keyboardType).toBe("email-address");
    expect(input.props.value).toBe("a");

    await fireEvent.changeText(input, "ab");
    expect(onChangeText).toHaveBeenCalledWith("ab");
  });

  it("lets a caller adjust the input without losing its minimum size", async () => {
    await render(<FormField inputStyle={{ paddingTop: 12 }} label="Message" />);

    const style = StyleSheet.flatten(screen.getByLabelText("Message").props.style);
    expect(style.paddingTop).toBe(12);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("leaves room for something at the end of the input", async () => {
    await render(<FormField label="Password" trailing={<Text>Show</Text>} />);

    expect(screen.getByText("Show")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText("Password").props.style).paddingRight).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
  });

  it("forwards a ref to the input", async () => {
    const ref = createRef<ComponentRef<typeof TextInput>>();
    await render(<FormField label="Email" ref={ref} />);

    expect(ref.current).not.toBeNull();
  });

  it("announces a required field and marks it visually", async () => {
    await render(<FormField label="Email" required />);

    expect(screen.getByLabelText("Email, required")).toBeTruthy();
    expect(screen.getByText("*", { exact: false, includeHiddenElements: true })).toBeTruthy();
  });

  it("shows the hint when there's no error", async () => {
    await render(<FormField hint="We never share it." label="Email" />);

    expect(screen.getByText("We never share it.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces the hint with an announced error and marks the input", async () => {
    await render(<FormField error="Enter a valid email." hint="We never share it." label="Email" />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Enter a valid email.")).toBeTruthy();
    expect(screen.queryByText("We never share it.")).toBeNull();

    const input = screen.getByLabelText("Email");
    expect(input.props.accessibilityHint).toBe("Enter a valid email.");
    expect(StyleSheet.flatten(input.props.style).borderColor).toBe(lightColors.destructiveText);
    expect(StyleSheet.flatten(screen.getByRole("alert").props.style).color).toBe(
      lightColors.destructiveText,
    );
  });

  it("announces an error to screen readers when it appears or changes, and only then", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();

    const { rerender } = await render(<FormField hint="We never share it." label="Email" />);
    expect(announce).not.toHaveBeenCalled();

    await rerender(<FormField error="Enter a valid email." label="Email" />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith("Enter a valid email.");

    await rerender(<FormField error="Enter a valid email." label="Email" value="a" />);
    expect(announce).toHaveBeenCalledTimes(1);

    await rerender(<FormField error="That email is taken." label="Email" />);
    expect(announce).toHaveBeenCalledTimes(2);

    await rerender(<FormField label="Email" />);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("shows a counter that screen readers skip, and announces an error that doesn't change with it", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const error = "Keep this to 5,000 characters or fewer.";

    const { rerender } = await render(<FormField counter="5,100 / 5,000" error={error} label="Notes" />);
    expect(screen.getByText("5,100 / 5,000", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("5,100 / 5,000")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(announce).toHaveBeenCalledTimes(1);

    // Another over-limit value: the counter moves, the announced message does not.
    await rerender(<FormField counter="5,101 / 5,000" error={error} label="Notes" />);
    expect(screen.getByText("5,101 / 5,000", { includeHiddenElements: true })).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(error);
  });
});
