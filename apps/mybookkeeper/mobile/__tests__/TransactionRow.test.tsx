import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import TransactionRow from "../src/features/transactions/TransactionRow";
import { aTransaction } from "../test-support/transactionsServer";

const LONG_VENDOR = "Northwest Plumbing and Heating Supply Company";

async function showRow(): Promise<void> {
  await render(<TransactionRow onPress={() => {}} propertyName="Oak Street Duplex" transaction={aTransaction({ vendor: LONG_VENDOR })} />);
}

function details() {
  return screen.getByText(/^Mar 14 · /);
}

describe("TransactionRow text size", () => {
  it("keeps the name and details to one line each, the name beside the amount, at the default text size", async () => {
    await showRow();

    expect(screen.getByText(LONG_VENDOR).props.numberOfLines).toBe(1);
    expect(details().props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBe("row");
  });

  it("shows the whole name with the amount below it, and wraps the details, at a large text size", async () => {
    setFontScale(2);
    await showRow();

    expect(screen.getByText(LONG_VENDOR).props.numberOfLines).toBeUndefined();
    expect(details().props.numberOfLines).toBeUndefined();
    expect(details().props.children).toContain("Oak Street Duplex");
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBeUndefined();
    expect(screen.getByText(/\$84\.20$/)).toBeTruthy();
  });

  it("says the same thing to a screen reader at either text size", async () => {
    await showRow();
    const label = screen.getByRole("button").props.accessibilityLabel;
    setFontScale(2);
    await showRow();

    expect(screen.getByRole("button").props.accessibilityLabel).toBe(label);
  });
});
