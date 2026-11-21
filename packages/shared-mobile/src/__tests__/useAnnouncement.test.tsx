import { renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useAnnouncement } from "../hooks/useAnnouncement";
import type { AnnouncementOptions } from "../types/AnnouncementOptions";
import type { AnnouncementPoliteness } from "../types/AnnouncementPoliteness";

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");

interface Props {
  message: string | undefined;
  politeness?: AnnouncementPoliteness;
  options?: AnnouncementOptions;
}

const announcing = (initialProps: Props) => renderHook(({ message, politeness, options }: Props) => useAnnouncement(message, politeness, options), { initialProps });

describe("useAnnouncement", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads a message when it appears and each time it changes, cutting in by default", async () => {
    const { rerender } = await announcing({ message: "Saving" });
    expect(announce).toHaveBeenCalledWith("Saving");
    await rerender({ message: "Saving" });
    await rerender({ message: "Saved" });
    expect(announce.mock.calls).toEqual([["Saving"], ["Saved"]]);
  });

  it("says nothing for no message", async () => {
    await announcing({ message: undefined });
    await announcing({ message: "" });
    expect(announce).not.toHaveBeenCalled();
    expect(announcePolitely).not.toHaveBeenCalled();
  });

  it("queues a polite message behind what is being said", async () => {
    await announcing({ message: "3 selected", politeness: "polite" });
    expect(announcePolitely).toHaveBeenCalledWith("3 selected", { queue: true });
    expect(announce).not.toHaveBeenCalled();
  });

  describe("onChangeOnly", () => {
    const options: AnnouncementOptions = { onChangeOnly: true };

    it("leaves the first message unsaid and reads later changes", async () => {
      const { rerender } = await announcing({ message: "Showing 50 of 120", politeness: "polite", options });
      await rerender({ message: "Showing 50 of 120", politeness: "polite", options });
      expect(announcePolitely).not.toHaveBeenCalled();

      await rerender({ message: "Showing 100 of 120", politeness: "polite", options });
      expect(announcePolitely.mock.calls).toEqual([["Showing 100 of 120", { queue: true }]]);
    });

    it("reads the first message when there was none on the first render", async () => {
      const { rerender } = await announcing({ message: undefined, options });
      await rerender({ message: "At the limit", options });
      expect(announce).toHaveBeenCalledWith("At the limit");
    });

    it("reads the first message again once it has gone and come back", async () => {
      const { rerender } = await announcing({ message: "At the limit", options });
      await rerender({ message: undefined, options });
      await rerender({ message: "At the limit", options });
      expect(announce.mock.calls).toEqual([["At the limit"]]);
    });
  });
});
