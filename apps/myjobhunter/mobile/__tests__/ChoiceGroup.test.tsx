import { fireEvent, render, screen } from "@testing-library/react-native";
import ChoiceGroup from "../src/components/forms/ChoiceGroup";

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
});
