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

  describe("as a section's note", () => {
    const politeAnnounce = () => jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");

    it("is a quiet line, not an alert, that is read politely once when it appears", async () => {
      const announce = politeAnnounce();
      announce.mockClear();
      await render(<StaleDataBanner isShown variant="note" />);
      expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(SHOWING_LAST_LOADED_MESSAGE, { queue: true });
    });

    it("isn't read again when the screen re-renders", async () => {
      const announce = politeAnnounce();
      announce.mockClear();
      const screenUnderTest = await render(<StaleDataBanner isShown variant="note" />);
      await screenUnderTest.rerender(<StaleDataBanner isShown variant="note" />);
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it("is read when it appears after the data was fresh, and again when its wording changes", async () => {
      const announce = politeAnnounce();
      announce.mockClear();
      const screenUnderTest = await render(<StaleDataBanner isShown={false} variant="note" />);
      expect(announce).not.toHaveBeenCalled();
      await screenUnderTest.rerender(<StaleDataBanner isShown variant="note" />);
      await screenUnderTest.rerender(<StaleDataBanner isShown variant="note" message="Couldn't update this." />);
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith("Couldn't update this.", { queue: true });
    });
  });

  it("as a banner, is announced exactly once", async () => {
    const assertive = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const polite = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
    assertive.mockClear();
    polite.mockClear();
    await render(<StaleDataBanner isShown />);
    expect(assertive.mock.calls.length + polite.mock.calls.length).toBe(1);
  });

  it("uses an app's own wording when given", async () => {
    await render(<StaleDataBanner isShown message="Couldn't update this." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't update this.");
  });
});
