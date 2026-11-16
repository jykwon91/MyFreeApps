import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, View } from "react-native";
import FieldError from "../components/FieldError";
import { fieldErrorsSummary } from "../constants/formField";

function spyOnAnnouncements() {
  const polite = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions").mockClear().mockImplementation(() => undefined);
  const assertive = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear().mockImplementation(() => undefined);
  return { polite, assertive };
}

describe("FieldError", () => {
  it("shows the message as plain text, not an alert", async () => {
    await render(<FieldError message="Choose a date." name="Date" />);

    expect(screen.getByText("Choose a date.")).toBeTruthy();
    expect(screen.queryAllByRole("alert", { includeHiddenElements: true })).toHaveLength(0);
  });

  it("shows nothing and says nothing without a message", async () => {
    const { polite } = spyOnAnnouncements();
    await render(<FieldError message={undefined} name="Date" />);

    expect(screen.toJSON()).toBeNull();
    expect(polite).not.toHaveBeenCalled();
  });

  it("reads its message once, politely, and not again when the screen re-renders", async () => {
    const { polite, assertive } = spyOnAnnouncements();
    const { rerender } = await render(<FieldError message="Choose a date." name="Date" />);
    await rerender(<FieldError message="Choose a date." name="Date" />);

    expect(polite.mock.calls.map(([message]) => message)).toEqual(["Choose a date."]);
    expect(assertive).not.toHaveBeenCalled();
  });

  it("joins the other fields' errors from the same render in one summary", async () => {
    const { polite } = spyOnAnnouncements();
    await render(
      <View>
        <FieldError message="Choose a date." name="Date" />
        <FieldError message="Add an amount." name="Amount" />
      </View>,
    );

    expect(polite.mock.calls.map(([message]) => message)).toEqual([fieldErrorsSummary(["Date", "Amount"])]);
  });
});
