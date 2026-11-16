import { setFontScale } from "@platform/mobile/test-support/fontScale";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ApplicantRow from "../src/features/applicants/ApplicantRow";
import { anApplicant } from "../test-support/applicantsServer";

const LONG_NAME = "Maximiliana Alexandra Featherstonehaugh-Worthington";
const EMPLOYER = "Providence St. Vincent Medical Center";

async function showRow(): Promise<void> {
  await render(<ApplicantRow applicant={anApplicant({ legal_name: LONG_NAME, employer_or_hospital: EMPLOYER })} onPress={() => {}} showStage />);
}

function details() {
  return screen.getByText(new RegExp(`^${EMPLOYER}`));
}

describe("ApplicantRow text size", () => {
  it("keeps the name and details to one line each, the name beside when they applied, at the default text size", async () => {
    await showRow();

    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(1);
    expect(details().props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBe("row");
  });

  it("shows the whole name and details, stacked, at a large text size", async () => {
    setFontScale(2);
    await showRow();

    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBeUndefined();
    expect(details().props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId("list-row-title").props.style).flexDirection).toBeUndefined();
  });
});
