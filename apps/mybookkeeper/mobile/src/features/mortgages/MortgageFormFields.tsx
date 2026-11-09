import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import { MORTGAGE_RATE_TYPES } from "@mybookkeeper/api-client/types/mortgage/mortgage-rate-type";
import { FormField, OptionRow, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import {
  MORTGAGE_FORM_MESSAGES as MESSAGES,
  MORTGAGE_NOTES_MAX_LENGTH,
  MORTGAGE_PROBLEM_MESSAGES,
  MORTGAGE_RATE_TYPE_LABELS,
  MORTGAGE_TEXT_MAX_LENGTH,
} from "../../constants/mortgageForm";
import OptionalDateField from "../shell/OptionalDateField";
import MortgageMoneyField from "./MortgageMoneyField";

interface MortgageFormFieldsProps {
  values: MortgageFormValues;
  onChange: (field: keyof MortgageFormValues, value: string) => void;
  /** Only shown once the person has tried to save, so a half-typed form isn't scolded. */
  problems: MortgageFormProblems;
  isBusy: boolean;
}

/** Ordered by what the comparison needs: the rate first, then the money, then record-keeping. */
export default function MortgageFormFields({ values, onChange, problems, isBusy }: MortgageFormFieldsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const problemText = (field: keyof MortgageFormValues) => (problems[field] ? MORTGAGE_PROBLEM_MESSAGES[problems[field]] : undefined);
  const today = new Date();

  return (
    <>
      <FormField editable={!isBusy} hint={MESSAGES.lenderHint} label={MESSAGES.lender} maxLength={MORTGAGE_TEXT_MAX_LENGTH} onChangeText={(text) => onChange("lender", text)} value={values.lender} />
      <FormField
        editable={!isBusy}
        error={problemText("interestRate")}
        hint={MESSAGES.rateHint}
        keyboardType="decimal-pad"
        label={MESSAGES.rate}
        onChangeText={(text) => onChange("interestRate", text)}
        value={values.interestRate}
      />

      <View accessibilityLabel={MESSAGES.rateType} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{`${MESSAGES.rateType} *`}</Text>
        {MORTGAGE_RATE_TYPES.map((choice) => (
          <OptionRow
            isSelected={values.rateType === choice}
            key={choice}
            label={MORTGAGE_RATE_TYPE_LABELS[choice]}
            onPress={() => {
              if (!isBusy) onChange("rateType", choice);
            }}
          />
        ))}
        <Text style={{ fontSize: fontSize.sm, color: problems.rateType ? colors.destructiveText : colors.mutedForeground }}>
          {problemText("rateType") ?? MESSAGES.rateTypeHint}
        </Text>
      </View>

      {values.rateType === "arm" ? (
        <View style={{ gap: spacing.xs }}>
          <OptionalDateField label={MESSAGES.fixedUntil} onChange={(iso) => onChange("fixedUntil", iso ?? "")} startsAt={today} value={values.fixedUntil || null} />
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.fixedUntilHint}</Text>
        </View>
      ) : null}

      <MortgageMoneyField error={problemText("balanceDollars")} isBusy={isBusy} label={MESSAGES.balance} onChange={onChange} field="balanceDollars" value={values.balanceDollars} />
      <OptionalDateField
        error={problemText("statementDate")}
        label={MESSAGES.statementDate}
        onChange={(iso) => onChange("statementDate", iso ?? "")}
        startsAt={today}
        value={values.statementDate || null}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.balanceHint}</Text>

      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.payoffIntro}</Text>
      <OptionalDateField label={MESSAGES.maturityDate} onChange={(iso) => onChange("maturityDate", iso ?? "")} startsAt={today} value={values.maturityDate || null} />
      <MortgageMoneyField error={problemText("monthlyPrincipalDollars")} isBusy={isBusy} label={MESSAGES.monthlyPrincipal} onChange={onChange} field="monthlyPrincipalDollars" value={values.monthlyPrincipalDollars} />
      <MortgageMoneyField error={problemText("monthlyInterestDollars")} isBusy={isBusy} label={MESSAGES.monthlyInterest} onChange={onChange} field="monthlyInterestDollars" value={values.monthlyInterestDollars} />
      <MortgageMoneyField error={problemText("monthlyEscrowDollars")} hint={MESSAGES.escrowHint} isBusy={isBusy} label={MESSAGES.monthlyEscrow} onChange={onChange} field="monthlyEscrowDollars" value={values.monthlyEscrowDollars} />

      <MortgageMoneyField error={problemText("originalPrincipalDollars")} isBusy={isBusy} label={MESSAGES.originalLoan} onChange={onChange} field="originalPrincipalDollars" value={values.originalPrincipalDollars} />
      <FormField
        editable={!isBusy}
        error={problemText("termMonths")}
        keyboardType="number-pad"
        label={MESSAGES.term}
        onChangeText={(text) => onChange("termMonths", text)}
        value={values.termMonths}
      />
      <FormField
        editable={!isBusy}
        hint={MESSAGES.accountHint}
        label={MESSAGES.accountNumber}
        maxLength={MORTGAGE_TEXT_MAX_LENGTH}
        onChangeText={(text) => onChange("accountNumber", text)}
        value={values.accountNumber}
      />
      <FormField
        editable={!isBusy}
        inputStyle={{ minHeight: 96, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.notes}
        maxLength={MORTGAGE_NOTES_MAX_LENGTH}
        multiline
        onChangeText={(text) => onChange("notes", text)}
        value={values.notes}
      />
    </>
  );
}
