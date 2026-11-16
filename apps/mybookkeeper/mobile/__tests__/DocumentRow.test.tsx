import { LARGE_TEXT_FILE_NAME_LINES } from "@platform/mobile";
import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import DocumentRow from "../src/features/documents/DocumentRow";
import { aDocument } from "../test-support/documentsServer";

const LONG_FILE = "2026-03-14 Northwest Plumbing invoice for the Oak Street duplex.pdf";

async function showRow(): Promise<void> {
  await render(<DocumentRow document={aDocument({ file_name: LONG_FILE, is_escrow_paid: true })} onPress={() => {}} />);
}

function asideRow() {
  return StyleSheet.flatten(screen.getByTestId("list-row-title-aside").props.style);
}

describe("DocumentRow text size", () => {
  it("keeps the file name to one line, cut in the middle, beside its chips at the default text size", async () => {
    await showRow();

    const name = screen.getByText(LONG_FILE);
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe("middle");
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style)).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(asideRow().flexWrap).toBe("nowrap");
  });

  it("gives the file name more lines and wraps the chips below it at a large text size", async () => {
    setFontScale(2);
    await showRow();

    expect(screen.getByText(LONG_FILE).props.numberOfLines).toBe(LARGE_TEXT_FILE_NAME_LINES);
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBeUndefined();
    expect(asideRow()).toMatchObject({ flexDirection: "row", flexWrap: "wrap" });
  });
});
