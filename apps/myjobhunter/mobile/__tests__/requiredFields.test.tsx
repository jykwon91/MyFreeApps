import { fireEvent, render, screen } from "@testing-library/react-native";
import ChoiceGroup from "../src/components/forms/ChoiceGroup";
import PickerField from "../src/components/forms/PickerField";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View };
});

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
] as const;

function renderPicker(required: boolean) {
  return render(
    <PickerField label="Start date" mode="date" onClear={jest.fn()} onPick={jest.fn()} openAndroid={jest.fn()} pickerDate={new Date(2026, 0, 1)} required={required} valueText={null} />,
  );
}

describe("required fields outside FormField", () => {
  it("keeps the picker's asterisk from being read as 'star' and says the button is required", async () => {
    await renderPicker(true);

    expect(screen.queryByText("*", { exact: false })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose start date, required" })).toBeTruthy();
  });

  it("leaves an optional picker's button unmarked", async () => {
    await renderPicker(false);

    expect(screen.getByRole("button", { name: "Choose start date" })).toBeTruthy();
  });

  it("hides the choice group's asterisk and says the group is required", async () => {
    await render(<ChoiceGroup label="Type" onChange={jest.fn()} options={OPTIONS} required value="" />);

    expect(screen.queryByText("*", { exact: false })).toBeNull();
    expect(screen.getByLabelText("Type, required")).toBeTruthy();
  });

  it("leaves an optional choice group's name alone", async () => {
    const onChange = jest.fn();
    await render(<ChoiceGroup label="Type" onChange={onChange} options={OPTIONS} value="" />);

    expect(screen.getByLabelText("Type")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
