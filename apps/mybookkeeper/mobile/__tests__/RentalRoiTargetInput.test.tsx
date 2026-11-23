import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES, RENTAL_ROI_TARGET_INPUT_MIN_WIDTH } from "../src/constants/rentalRoi";
import RentalRoiTargetInput from "../src/features/analytics/RentalRoiTargetInput";

async function showInput(isUpdating = false) {
  await render(<RentalRoiTargetInput isUpdating={isUpdating} onChange={jest.fn()} value={8} />);
  return screen.getByTestId("rental-roi-target-input");
}

describe("RentalRoiTargetInput accessibility", () => {
  afterEach(() => setFontScale(1));

  it("gives the label to the input and leaves the visible label out of the reading order", async () => {
    const input = await showInput();

    expect(input.props.accessibilityLabel).toBe(MESSAGES.targetLabel);
    const label = screen.getByText(MESSAGES.targetLabel, { includeHiddenElements: true });
    expect(label.props.importantForAccessibility).toBe("no");
    expect(label.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByText(MESSAGES.targetLabel)).toBeNull();
    expect(screen.getAllByLabelText(MESSAGES.targetLabel)).toHaveLength(1);
  });

  it("is not fixed at 72 wide", async () => {
    const input = await showInput();
    const style = StyleSheet.flatten(input.props.style);
    expect(style.width).toBeUndefined();
    expect(style.minWidth).toBe(RENTAL_ROI_TARGET_INPUT_MIN_WIDTH);
  });

  it("grows with the text size so the typed number is not cut off", async () => {
    setFontScale(2);
    const large = await showInput();
    expect(StyleSheet.flatten(large.props.style).minWidth).toBe(RENTAL_ROI_TARGET_INPUT_MIN_WIDTH * 2);
  });

  it("shows the updating region as a busy progress indicator while updating", async () => {
    await showInput(true);
    expect(screen.getByRole("progressbar", { name: MESSAGES.updatingLabel })).toBeTruthy();
  });
});
