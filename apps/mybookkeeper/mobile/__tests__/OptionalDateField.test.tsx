import { render, screen } from "@testing-library/react-native";
import OptionalDateField from "../src/features/shell/OptionalDateField";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

describe("OptionalDateField required marking", () => {
  it("hides the asterisk from screen readers and says the button is required", async () => {
    await render(<OptionalDateField label="Start date" onChange={jest.fn()} required startsAt={new Date(2026, 0, 1)} value={null} />);

    expect(screen.queryByText("*", { exact: false })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose start date, required" })).toBeTruthy();
  });

  it("leaves an optional field's button unmarked", async () => {
    await render(<OptionalDateField label="End date" onChange={jest.fn()} startsAt={new Date(2026, 0, 1)} value={null} />);

    expect(screen.getByRole("button", { name: "Choose end date" })).toBeTruthy();
  });
});
