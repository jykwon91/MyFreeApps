import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import SectionError from "../components/SectionError";

describe("SectionError", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the reason as an alert and reads it out politely, on iOS as well as Android", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
    await render(<SectionError message="I couldn't load your properties." onRetry={jest.fn()} retryLabel="Try again" />);

    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load your properties.");
    // Polite, so several failed sections on one screen queue up instead of cutting each other off.
    expect(announcePolitely).toHaveBeenCalledWith("I couldn't load your properties.", { queue: true });
    expect(announce).not.toHaveBeenCalled();
  });

  it("tries again on press", async () => {
    const onRetry = jest.fn();
    await render(<SectionError message="Couldn't load" onRetry={onRetry} retryLabel="Try again" />);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
