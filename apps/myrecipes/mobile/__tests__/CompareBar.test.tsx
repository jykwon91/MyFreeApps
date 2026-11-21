import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../src/constants/versions";
import CompareBar from "../src/features/versions/CompareBar";

const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");

beforeEach(() => jest.clearAllMocks());

function bar(isComparing: boolean, pickedCount: number) {
  return <CompareBar isComparing={isComparing} onCancel={jest.fn()} onCompare={jest.fn()} onStart={jest.fn()} pickedCount={pickedCount} />;
}

describe("CompareBar", () => {
  it("reads how many versions are picked as the count changes, on iOS as well as Android", async () => {
    await render(bar(false, 0));
    expect(announcePolitely).not.toHaveBeenCalled();

    await screen.rerender(bar(true, 0));
    expect(announcePolitely).toHaveBeenCalledWith(MESSAGES.pickTwo(0), { queue: true });
    await screen.rerender(bar(true, 1));
    expect(announcePolitely).toHaveBeenCalledWith(MESSAGES.pickTwo(1), { queue: true });
  });
});
