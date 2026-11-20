import { SALARY_PERIOD_OPTIONS } from "@myjobhunter/api-client/constants/salaryPeriodOptions";
import type { SalaryPeriod } from "@myjobhunter/api-client/types/application/salary-period";
import { FormField, OptionSheet, PickerField } from "@platform/mobile";
import { useState } from "react";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { PostedSalaryFieldsProps } from "../../types/PostedSalaryFieldsProps";

/** The posted salary range, as on the website: from, to and what it's per, in the currency the posting named. */
export default function PostedSalaryFields({ values, errors, onEdit, disabled }: PostedSalaryFieldsProps) {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const periodLabel = SALARY_PERIOD_OPTIONS.find((option) => option.value === values.posted_salary_period)?.label ?? "";
  const currency = values.posted_salary_currency;

  return (
    <>
      <FormField
        editable={!disabled}
        error={errors.posted_salary_min}
        keyboardType="decimal-pad"
        label={`${MESSAGES.salaryFromLabel} (${currency})`}
        onChangeText={(text) => onEdit("posted_salary_min", text)}
        placeholder={MESSAGES.salaryFromPlaceholder}
        value={values.posted_salary_min}
      />
      <FormField
        editable={!disabled}
        error={errors.posted_salary_max}
        keyboardType="decimal-pad"
        label={`${MESSAGES.salaryToLabel} (${currency})`}
        onChangeText={(text) => onEdit("posted_salary_max", text)}
        placeholder={MESSAGES.salaryToPlaceholder}
        value={values.posted_salary_max}
      />
      <PickerField disabled={disabled} label={MESSAGES.salaryPeriodLabel} onPress={() => setIsPeriodOpen(true)} valueLabel={periodLabel} />
      <OptionSheet<SalaryPeriod | "">
        isOpen={isPeriodOpen}
        onClose={() => setIsPeriodOpen(false)}
        onSelect={(value) => {
          onEdit("posted_salary_period", value);
          setIsPeriodOpen(false);
        }}
        options={SALARY_PERIOD_OPTIONS}
        title={MESSAGES.salaryPeriodTitle}
        value={values.posted_salary_period}
      />
    </>
  );
}
