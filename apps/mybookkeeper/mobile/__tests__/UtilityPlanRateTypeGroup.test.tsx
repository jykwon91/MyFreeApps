import { EMPTY_UTILITY_PLAN_FORM } from "@mybookkeeper/api-client/utils/utilityPlanForm";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../src/constants/utilityPlanForm";
import UtilityPlanFormFields from "../src/features/utilityPlans/UtilityPlanFormFields";

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

async function show(props: { isBusy?: boolean; rateTypeProblem?: string } = {}) {
  const onChange = jest.fn();
  await render(
    <UtilityPlanFormFields
      isBusy={props.isBusy ?? false}
      onChange={onChange}
      onPickService={jest.fn()}
      problems={props.rateTypeProblem ? { rateType: props.rateTypeProblem } : {}}
      values={EMPTY_UTILITY_PLAN_FORM}
    />,
  );
  return onChange;
}

describe("the utility plan rate type choice", () => {
  it("reads as required, with no spoken asterisk", async () => {
    await show();
    expect(screen.getByLabelText(`${MESSAGES.rateType}, required`)).toBeTruthy();
    expect(screen.queryByText(`${MESSAGES.rateType} *`)).toBeNull();
  });

  it("picks a rate type", async () => {
    const onChange = await show();
    await fireEvent.press(screen.getByRole("radio", { name: "Variable" }));
    expect(onChange).toHaveBeenCalledWith("rateType", "variable");
  });

  it("reads each choice as disabled and ignores taps while saving", async () => {
    const onChange = await show({ isBusy: true });
    for (const name of ["Fixed", "Variable", "Indexed", "Regulated"]) {
      expect(screen.getByRole("radio", { name }).props.accessibilityState).toMatchObject({ disabled: true });
    }
    await fireEvent.press(screen.getByRole("radio", { name: "Variable" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a problem with the choice as the group's hint", async () => {
    await show({ rateTypeProblem: "Pick a rate type." });
    expect(screen.getByLabelText(`${MESSAGES.rateType}, required`).props.accessibilityHint).toBe("Pick a rate type.");
    expect(screen.getByText("Pick a rate type.")).toBeTruthy();
  });
});
