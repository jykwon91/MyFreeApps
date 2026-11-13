import { fireEvent, render, screen } from "@testing-library/react-native";
import ChipButton from "../components/ChipButton";

describe("ChipButton", () => {
  it("is a plain button that presses", async () => {
    const onPress = jest.fn();
    await render(<ChipButton label="Add" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is a checkbox that says whether it is on when given isChecked", async () => {
    await render(<ChipButton isChecked label="Remote" onPress={() => {}} />);

    expect(screen.getByRole("checkbox", { name: "Remote" }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it("reads its accessibility label instead of the visible label", async () => {
    await render(<ChipButton accessibilityLabel="Add Python" label="+ Python" onPress={() => {}} />);

    expect(screen.getByRole("button", { name: "Add Python" })).toBeTruthy();
  });

  it("does not press when disabled", async () => {
    const onPress = jest.fn();
    await render(<ChipButton disabled label="Add" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
