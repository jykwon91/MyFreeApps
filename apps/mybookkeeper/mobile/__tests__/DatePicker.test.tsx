import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import DatePicker from "../src/features/shell/DatePicker";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

describe("DatePicker on Android", () => {
  const onChange = jest.fn();
  let platform: jest.ReplaceProperty<typeof Platform.OS>;

  beforeEach(() => {
    jest.clearAllMocks();
    platform = jest.replaceProperty(Platform, "OS", "android");
  });
  afterEach(() => platform.restore());

  async function openCalendar() {
    await render(<DatePicker label="Contract start" onChange={onChange} value="2026-12-01" />);
    await fireEvent.press(screen.getByRole("button", { name: /^Contract start: .*Change date$/ }));
    return (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
  }

  it("takes the day chosen in the dialog", async () => {
    const dialog = await openCalendar();
    dialog.onChange({ type: "set" }, new Date(2027, 0, 15));
    expect(onChange).toHaveBeenCalledWith("2027-01-15");
  });

  it("ignores the dialog being dismissed", async () => {
    const dialog = await openCalendar();
    dialog.onChange({ type: "dismissed" }, new Date(2027, 0, 15));
    expect(onChange).not.toHaveBeenCalled();
  });
});
