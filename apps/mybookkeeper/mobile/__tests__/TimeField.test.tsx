import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import TimeField from "../src/features/shell/TimeField";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

async function renderField(onChange: (time: string) => void, error?: string) {
  await render(
    <TimeField error={error} label="At" onChange={onChange} value="18:00" />,
  );
}

afterEach(() => jest.restoreAllMocks());

describe("TimeField", () => {
  it("shows the time as a clock reading and any error", async () => {
    await renderField(jest.fn(), "Pick a time.");

    expect(screen.getByText("6:00 PM")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("spins in place on iOS under a Done button", async () => {
    const onChange = jest.fn();
    await renderField(onChange);

    await fireEvent.press(screen.getByLabelText("Change at"));
    expect(screen.getByLabelText("Done choosing at")).toBeTruthy();
    await act(async () => {
      screen.getByTestId("At-picker").props.onChange({ type: "set" }, new Date(2000, 0, 1, 7, 5));
    });
    expect(onChange).toHaveBeenCalledWith("07:05");

    await fireEvent.press(screen.getByLabelText("Done choosing at"));
    expect(screen.queryByTestId("At-picker")).toBeNull();
  });

  describe("on Android", () => {
    beforeEach(() => jest.replaceProperty(Platform, "OS", "android"));

    it("opens the clock dialog at the current time and reports a set time", async () => {
      const onChange = jest.fn();
      await renderField(onChange);

      await fireEvent.press(screen.getByLabelText("Change at"));
      const options = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
      expect(options.mode).toBe("time");
      expect(options.value.getHours()).toBe(18);
      options.onChange?.({ type: "set" } as never, new Date(2000, 0, 1, 9, 30));

      expect(onChange).toHaveBeenCalledWith("09:30");
    });

    it("ignores a dismissed dialog", async () => {
      const onChange = jest.fn();
      await renderField(onChange);

      await fireEvent.press(screen.getByLabelText("Change at"));
      jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0].onChange?.({ type: "dismissed" } as never, undefined);

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
