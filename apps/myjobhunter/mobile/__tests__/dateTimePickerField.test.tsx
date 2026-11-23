import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import DateTimePickerField from "../src/components/forms/DateTimePickerField";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View };
});

function renderField(extra: { error?: string; hint?: string; required?: boolean } = {}) {
  return render(
    <DateTimePickerField label="Start date" mode="date" onClear={jest.fn()} onPick={jest.fn()} openAndroid={jest.fn()} pickerDate={new Date(2026, 0, 1)} valueText={null} {...extra} />,
  );
}

afterEach(() => jest.restoreAllMocks());

describe("DateTimePickerField spoken name and hint", () => {
  it("puts the error in the button's name, where it is read even with hints off", async () => {
    await renderField({ error: "Pick a date" });

    expect(screen.getByRole("button", { name: "Choose start date, error: Pick a date" })).toBeTruthy();
  });

  it("says required before the error", async () => {
    await renderField({ error: "Pick a date", required: true });

    expect(screen.getByRole("button", { name: "Choose start date, required, error: Pick a date" })).toBeTruthy();
  });

  it("keeps the hint as the hint, with or without an error", async () => {
    await renderField({ hint: "In your local time" });
    expect(screen.getByRole("button", { name: "Choose start date" }).props.accessibilityHint).toBe("In your local time");

    await screen.rerender(
      <DateTimePickerField error="Pick a date" hint="In your local time" label="Start date" mode="date" onClear={jest.fn()} onPick={jest.fn()} openAndroid={jest.fn()} pickerDate={new Date(2026, 0, 1)} valueText={null} />,
    );
    expect(screen.getByRole("button", { name: "Choose start date, error: Pick a date" }).props.accessibilityHint).toBe("In your local time");
  });
});

describe("DateTimePickerField open state", () => {
  it("says on iOS whether the spinner is open", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await renderField();

    expect(screen.getByRole("button", { name: "Choose start date", expanded: false })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Choose start date" }));
    expect(screen.getByRole("button", { name: "Done choosing start date", expanded: true })).toBeTruthy();
  });

  it("leaves Android's modal dialog button without an open state", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderField();

    expect(screen.getByRole("button", { name: "Choose start date" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose start date", expanded: false })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose start date", expanded: true })).toBeNull();
  });
});
