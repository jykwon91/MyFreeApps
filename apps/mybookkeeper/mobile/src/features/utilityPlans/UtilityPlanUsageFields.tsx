import { SwitchRow } from "@platform/mobile";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import type { UtilityPlanFieldsProps } from "../../types/UtilityPlanFieldsProps";
import UtilityPlanInternetFields from "./UtilityPlanInternetFields";
import UtilityPlanTextField from "./UtilityPlanTextField";

/** The bill credit, then whatever else prices usage: a minimum-usage fee for metered service, the internet terms for internet. */
export default function UtilityPlanUsageFields(props: UtilityPlanFieldsProps) {
  const { values, onChange, isBusy } = props;
  const money = { ...props, keyboardType: "decimal-pad" as const };
  const whole = { ...props, keyboardType: "number-pad" as const };
  return (
    <>
      <SwitchRow disabled={isBusy} label={MESSAGES.hasBillCredit} onValueChange={(next) => onChange("hasBillCredit", next)} value={values.hasBillCredit} />
      {values.hasBillCredit ? (
        <>
          <UtilityPlanTextField {...money} field="billCreditAmount" label={MESSAGES.creditAmount} required />
          <UtilityPlanTextField {...whole} field="billCreditThreshold" label={MESSAGES.creditThreshold} required />
        </>
      ) : null}
      {values.serviceType === "internet" ? (
        <UtilityPlanInternetFields {...props} />
      ) : (
        <>
          <UtilityPlanTextField {...money} field="minUsageFee" label={MESSAGES.minUsageFee} />
          <UtilityPlanTextField {...whole} field="minUsageThreshold" label={MESSAGES.minUsageThreshold} />
        </>
      )}
    </>
  );
}
