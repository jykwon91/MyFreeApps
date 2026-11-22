import { mortgageProblemMessages } from "@mybookkeeper/api-client/constants/mortgageProblemMessages";
import type { MortgageFormProblems } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problems";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { ChoiceGroup, FIELD_PRESETS, FormField, useFieldChain, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import {
  MORTGAGE_FORM_MESSAGES as MESSAGES,
  MORTGAGE_NOTES_MAX_LENGTH,
  MORTGAGE_RATE_TYPE_OPTIONS,
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
  /** The phone's decimal mark, so example rates in problems read the way the keypad types. */
  decimalSeparator: DecimalSeparator;
}

/** Ordered by what the comparison needs: the rate first, then the money, then record-keeping. */
export default function MortgageFormFields({ values, onChange, problems, isBusy, decimalSeparator }: MortgageFormFieldsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const messages = mortgageProblemMessages(decimalSeparator);
  const problemText = (field: keyof MortgageFormValues) => (problems[field] ? messages[problems[field]] : undefined);
  const fields = useFieldChain<keyof MortgageFormValues>([
    "lender",
    "interestRate",
    "balanceDollars",
    "monthlyPrincipalDollars",
    "monthlyInterestDollars",
    "monthlyEscrowDollars",
    "originalPrincipalDollars",
    "termMonths",
    "accountNumber",
    "notes",
  ]);
  const today = new Date();

  return (
    <>
      <FormField {...fields.field("lender")} editable={!isBusy} hint={MESSAGES.lenderHint} label={MESSAGES.lender} maxLength={MORTGAGE_TEXT_MAX_LENGTH} onChangeText={(text) => onChange("lender", text)} value={values.lender} />
      <FormField
        {...FIELD_PRESETS.decimal}
        {...fields.field("interestRate")}
        editable={!isBusy}
        error={problemText("interestRate")}
        hint={MESSAGES.rateHint}
        label={MESSAGES.rate}
        onChangeText={(text) => onChange("interestRate", text)}
        value={values.interestRate}
      />

      <View style={{ gap: spacing.xs }}>
        <ChoiceGroup disabled={isBusy} error={problemText("rateType")} label={MESSAGES.rateType} onChange={(choice) => onChange("rateType", choice)} options={MORTGAGE_RATE_TYPE_OPTIONS} required value={values.rateType} />
        {problems.rateType ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.rateTypeHint}</Text>}
      </View>

      {values.rateType === "arm" ? (
        <View style={{ gap: spacing.xs }}>
          <OptionalDateField label={MESSAGES.fixedUntil} onChange={(iso) => onChange("fixedUntil", iso ?? "")} startsAt={today} value={values.fixedUntil || null} />
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.fixedUntilHint}</Text>
        </View>
      ) : null}

      <MortgageMoneyField fields={fields} error={problemText("balanceDollars")} isBusy={isBusy} label={MESSAGES.balance} onChange={onChange} field="balanceDollars" value={values.balanceDollars} />
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
      <MortgageMoneyField fields={fields} error={problemText("monthlyPrincipalDollars")} isBusy={isBusy} label={MESSAGES.monthlyPrincipal} onChange={onChange} field="monthlyPrincipalDollars" value={values.monthlyPrincipalDollars} />
      <MortgageMoneyField fields={fields} error={problemText("monthlyInterestDollars")} isBusy={isBusy} label={MESSAGES.monthlyInterest} onChange={onChange} field="monthlyInterestDollars" value={values.monthlyInterestDollars} />
      <MortgageMoneyField fields={fields} error={problemText("monthlyEscrowDollars")} hint={MESSAGES.escrowHint} isBusy={isBusy} label={MESSAGES.monthlyEscrow} onChange={onChange} field="monthlyEscrowDollars" value={values.monthlyEscrowDollars} />

      <MortgageMoneyField fields={fields} error={problemText("originalPrincipalDollars")} isBusy={isBusy} label={MESSAGES.originalLoan} onChange={onChange} field="originalPrincipalDollars" value={values.originalPrincipalDollars} />
      <FormField
        {...FIELD_PRESETS.wholeNumber}
        {...fields.field("termMonths")}
        editable={!isBusy}
        error={problemText("termMonths")}
        label={MESSAGES.term}
        onChangeText={(text) => onChange("termMonths", text)}
        value={values.termMonths}
      />
      <FormField
        {...FIELD_PRESETS.code}
        {...fields.field("accountNumber")}
        editable={!isBusy}
        hint={MESSAGES.accountHint}
        label={MESSAGES.accountNumber}
        maxLength={MORTGAGE_TEXT_MAX_LENGTH}
        onChangeText={(text) => onChange("accountNumber", text)}
        value={values.accountNumber}
      />
      <FormField
        {...fields.target("notes")}
        editable={!isBusy}
        label={MESSAGES.notes}
        maxLength={MORTGAGE_NOTES_MAX_LENGTH}
        multiline
        onChangeText={(text) => onChange("notes", text)}
        value={values.notes}
      />
    </>
  );
}
