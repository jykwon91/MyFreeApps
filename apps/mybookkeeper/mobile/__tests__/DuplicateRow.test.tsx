import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import DuplicateRow from "../src/features/duplicates/DuplicateRow";
import { aDuplicatePair, aDuplicateSide } from "../test-support/aDuplicatePair";

const LONG_VENDOR = "Northwest Plumbing and Heating Supply Company";

async function showRow(): Promise<void> {
  const pair = aDuplicatePair({
    transaction_a: aDuplicateSide({ id: "a1", vendor: LONG_VENDOR }),
    transaction_b: aDuplicateSide({ id: "b1", vendor: LONG_VENDOR, transaction_date: "2026-03-16" }),
  });
  await render(<DuplicateRow onPress={() => {}} pair={pair} />);
}

// The row is the only place in the list the two dates show.
function dates() {
  return screen.getByText(/Mar 14 and Mar 16$/);
}

describe("DuplicateRow text size", () => {
  it("keeps the name and the dates to one line each, the name beside the amount, at the default text size", async () => {
    await showRow();

    expect(screen.getByText(LONG_VENDOR).props.numberOfLines).toBe(1);
    expect(dates().props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBe("row");
  });

  it("shows the whole name and both dates, with the amount below the name, at a large text size", async () => {
    setFontScale(2);
    await showRow();

    expect(screen.getByText(LONG_VENDOR).props.numberOfLines).toBeUndefined();
    expect(dates().props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBeUndefined();
    expect(screen.getByText("$84.20")).toBeTruthy();
  });
});
