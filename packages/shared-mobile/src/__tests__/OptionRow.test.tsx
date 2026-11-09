import { fireEvent, render, screen } from "@testing-library/react-native";
import OptionRow from "../components/OptionRow";

describe("OptionRow", () => {
  it("is a radio unless said otherwise", async () => {
    await render(<OptionRow isSelected label="Oak St" onPress={jest.fn()} />);
    expect(screen.getByRole("radio", { name: "Oak St" }).props.accessibilityState).toEqual({ checked: true });
  });

  it("can be a checkbox, for a list that takes several", async () => {
    const onPress = jest.fn();
    await render(<OptionRow isSelected={false} kind="checkbox" label="Airbnb" onPress={onPress} />);
    const row = screen.getByRole("checkbox", { name: "Airbnb" });
    expect(row.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
