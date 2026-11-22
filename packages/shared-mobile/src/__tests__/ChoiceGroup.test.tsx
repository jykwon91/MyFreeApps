import { fireEvent, render, screen } from "@testing-library/react-native";
import ChoiceGroup from "../components/ChoiceGroup";

const OPTIONS = [
  { value: "lease", label: "Lease" },
  { value: "offer", label: "Offer" },
] as const;

describe("ChoiceGroup", () => {
  it("lets a choice be picked", async () => {
    const onChange = jest.fn();
    await render(<ChoiceGroup label="Kind" onChange={onChange} options={OPTIONS} value="lease" />);
    await fireEvent.press(screen.getByRole("radio", { name: "Offer" }));
    expect(onChange).toHaveBeenCalledWith("offer");
  });

  it("reads every option as disabled, and ignores taps, while disabled", async () => {
    const onChange = jest.fn();
    await render(<ChoiceGroup disabled label="Kind" onChange={onChange} options={OPTIONS} value="lease" />);
    for (const name of ["Lease", "Offer"]) {
      expect(screen.getByRole("radio", { name }).props.accessibilityState).toMatchObject({ disabled: true });
    }
    await fireEvent.press(screen.getByRole("radio", { name: "Offer" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads the group as required (not star) and hides the visible asterisk from screen readers", async () => {
    await render(<ChoiceGroup label="Kind" onChange={jest.fn()} options={OPTIONS} required value="" />);
    expect(screen.getByLabelText("Kind, required").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getByText(/^Kind/, { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it("marks only the chosen option as checked", async () => {
    await render(<ChoiceGroup label="Kind" onChange={jest.fn()} options={OPTIONS} value="offer" />);
    expect(screen.getByRole("radio", { name: "Offer" }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole("radio", { name: "Lease" }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it("carries the error as the group's hint and shows it once", async () => {
    await render(<ChoiceGroup error="Pick one." label="Kind" onChange={jest.fn()} options={OPTIONS} value="" />);
    expect(screen.getByLabelText("Kind").props.accessibilityHint).toBe("Pick one.");
    expect(screen.getAllByText("Pick one.")).toHaveLength(1);
  });
});
