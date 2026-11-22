import { render, screen } from "@testing-library/react-native";
import DataPrivacySection from "../components/DataPrivacySection";
import { SECURITY_MESSAGES } from "../constants/security";

describe("DataPrivacySection", () => {
  it("lists each part as a heading, with both buttons still reachable", async () => {
    await render(<DataPrivacySection exportDescription="Everything." onDeleteAccount={jest.fn()} onExport={jest.fn()} />);

    expect(screen.getByRole("header", { name: SECURITY_MESSAGES.dataHeading })).toBeTruthy();
    expect(screen.getByRole("header", { name: SECURITY_MESSAGES.exportHeading })).toBeTruthy();
    expect(screen.getByRole("header", { name: SECURITY_MESSAGES.deleteHeading })).toBeTruthy();
    expect(screen.getByRole("button", { name: SECURITY_MESSAGES.exportButton })).toBeTruthy();
    expect(screen.getByRole("button", { name: SECURITY_MESSAGES.deleteButton })).toBeTruthy();
  });
});
