import { type ComponentRef, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, TextInput } from "react-native";
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
    expect(StyleSheet.flatten(input.props.style).borderColor).toBe(lightColors.destructive);
  });
});
