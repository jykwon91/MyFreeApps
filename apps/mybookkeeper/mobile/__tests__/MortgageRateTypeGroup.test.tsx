import { EMPTY_MORTGAGE_FORM } from "@mybookkeeper/api-client/utils/mortgageForm";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../src/constants/mortgageForm";
import MortgageFormFields from "../src/features/mortgages/MortgageFormFields";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

async function show(props: { isBusy?: boolean; rateTypeProblem?: boolean; onChange?: jest.Mock } = {}) {
  const onChange = props.onChange ?? jest.fn();
  await render(
    <MortgageFormFields
      decimalSeparator="."
      isBusy={props.isBusy ?? false}
      onChange={onChange}
      problems={props.rateTypeProblem ? { rateType: "rate_type_required" } : {}}
      values={EMPTY_MORTGAGE_FORM}
    />,
  );
  return onChange;
}

describe("the mortgage rate type choice", () => {
  it("reads as required, with no spoken asterisk", async () => {
    await show();
    expect(screen.getByLabelText(`${MESSAGES.rateType}, required`)).toBeTruthy();
    expect(screen.queryByText(`${MESSAGES.rateType} *`)).toBeNull();
  });

  it("picks a rate type", async () => {
    const onChange = await show();
    await fireEvent.press(screen.getByRole("radio", { name: "Adjustable (ARM)" }));
    expect(onChange).toHaveBeenCalledWith("rateType", "arm");
  });

  it("reads each choice as disabled and ignores taps while saving", async () => {
    const onChange = await show({ isBusy: true });
    for (const name of ["Fixed for the life of the loan", "Adjustable (ARM)"]) {
      expect(screen.getByRole("radio", { name }).props.accessibilityState).toMatchObject({ disabled: true });
    }
    await fireEvent.press(screen.getByRole("radio", { name: "Adjustable (ARM)" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the hint under the choices", async () => {
    await show();
    expect(screen.getByText(MESSAGES.rateTypeHint)).toBeTruthy();
  });

  it("carries the reason as the group's hint instead of the usual hint", async () => {
    await show({ rateTypeProblem: true });
    expect(screen.getByLabelText(`${MESSAGES.rateType}, required`).props.accessibilityHint).toBe("Pick whether the rate is fixed or adjustable.");
    expect(screen.queryByText(MESSAGES.rateTypeHint)).toBeNull();
  });
});
