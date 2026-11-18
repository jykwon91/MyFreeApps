import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import StaleDataBanner from "../components/StaleDataBanner";
import { SHOWING_LAST_LOADED_MESSAGE } from "../constants/offline";

describe("StaleDataBanner", () => {
  it("shows nothing while the data on screen is fresh", async () => {
    await render(<StaleDataBanner isShown={false} />);
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();
  });

  it("says what's on screen is what was last loaded, as an announced alert", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await render(<StaleDataBanner isShown />);
    expect(screen.getByRole("alert")).toHaveTextContent(SHOWING_LAST_LOADED_MESSAGE);
    expect(announce).toHaveBeenCalledWith(SHOWING_LAST_LOADED_MESSAGE);
  });

  it("as a section's note, is a quiet line that isn't announced", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    await render(<StaleDataBanner isShown variant="note" />);
    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it("uses an app's own wording when given", async () => {
    await render(<StaleDataBanner isShown message="Couldn't update this." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't update this.");
  });
});
