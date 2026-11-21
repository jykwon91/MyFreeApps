import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import SectionError from "../components/SectionError";

describe("SectionError", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the reason as an alert and reads it out, on iOS as well as Android", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await render(<SectionError message="I couldn't load your properties." onRetry={jest.fn()} retryLabel="Try again" />);

    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load your properties.");
    expect(announce).toHaveBeenCalledWith("I couldn't load your properties.");
  });

  it("tries again on press", async () => {
    const onRetry = jest.fn();
    await render(<SectionError message="Couldn't load" onRetry={onRetry} retryLabel="Try again" />);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
