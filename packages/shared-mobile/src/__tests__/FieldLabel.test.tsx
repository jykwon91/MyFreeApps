import { render, screen } from "@testing-library/react-native";
import FieldLabel from "../components/FieldLabel";
import { requiredFieldLabel } from "../utils/requiredFieldLabel";

describe("FieldLabel", () => {
  it("hides the label and its asterisk from screen readers", async () => {
    await render(<FieldLabel label="Start date" required />);

    expect(screen.queryByText("*", { exact: false })).toBeNull();
    expect(screen.getByText("*", { exact: false, includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("Start date", { exact: false })).toBeNull();
  });

  it("draws no asterisk when the field is optional", async () => {
    await render(<FieldLabel label="Notes" />);

    expect(screen.queryByText("*", { exact: false, includeHiddenElements: true })).toBeNull();
  });
});

describe("requiredFieldLabel", () => {
  it("adds ', required' only for a required field", () => {
    expect(requiredFieldLabel("Email", true)).toBe("Email, required");
    expect(requiredFieldLabel("Email", false)).toBe("Email");
  });

  it("adds ', error: <message>' last, only when there is an error", () => {
    expect(requiredFieldLabel("Email", true, "Enter a valid email")).toBe("Email, required, error: Enter a valid email");
    expect(requiredFieldLabel("Email", false, "Enter a valid email")).toBe("Email, error: Enter a valid email");
    expect(requiredFieldLabel("Email", false, "")).toBe("Email");
  });
});
