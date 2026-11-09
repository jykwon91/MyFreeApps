import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { FREQUENCY_LABEL } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { INSURANCE_PREMIUM_FREQUENCIES, type InsurancePremiumFrequency } from "@mybookkeeper/api-client/types/insurance/insurance-premium-frequency";
import { FormField, OptionSheet, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { POLICY_FORM_MESSAGES, POLICY_NAME_MAX_LENGTH, POLICY_NOTES_MAX_LENGTH } from "../../constants/insuranceForm";
import { dateFromIso } from "../../lib/localDate";
import type { PolicyFormErrors } from "../../types/PolicyFormErrors";
import OptionalDateField from "../shell/OptionalDateField";
import PickerField from "../transactions/PickerField";

const NOT_BILLED = "none";

interface PolicyFormFieldsProps {
  values: InsurancePolicyFormValues;
  errors: PolicyFormErrors;
  onChange: (change: Partial<InsurancePolicyFormValues>) => void;
}

export default function PolicyFormFields({ values, errors, onChange }: PolicyFormFieldsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isBilledOpen, setIsBilledOpen] = useState(false);
  const billed = values.premiumFrequency === "" ? POLICY_FORM_MESSAGES.billedNone : FREQUENCY_LABEL[values.premiumFrequency as InsurancePremiumFrequency];
  // A blank end date opens on the start date's day: a policy rarely ends before it begins.
  const dateStart = values.effectiveDate ? dateFromIso(values.effectiveDate) : new Date();

  return (
    <>
      <FormField
        error={errors.policyName}
        label={POLICY_FORM_MESSAGES.policyName}
        maxLength={POLICY_NAME_MAX_LENGTH}
        onChangeText={(policyName) => onChange({ policyName })}
        placeholder={POLICY_FORM_MESSAGES.policyNamePlaceholder}
        required
        value={values.policyName}
      />
      <FormField label={POLICY_FORM_MESSAGES.carrier} maxLength={POLICY_NAME_MAX_LENGTH} onChangeText={(carrier) => onChange({ carrier })} placeholder={POLICY_FORM_MESSAGES.carrierPlaceholder} value={values.carrier} />
      <FormField label={POLICY_FORM_MESSAGES.policyNumber} maxLength={POLICY_NAME_MAX_LENGTH} onChangeText={(policyNumber) => onChange({ policyNumber })} value={values.policyNumber} />
      <OptionalDateField label={POLICY_FORM_MESSAGES.effectiveDate} onChange={(iso) => onChange({ effectiveDate: iso ?? "" })} startsAt={new Date()} value={values.effectiveDate || null} />
      <OptionalDateField error={errors.expirationDate} label={POLICY_FORM_MESSAGES.expirationDate} onChange={(iso) => onChange({ expirationDate: iso ?? "" })} startsAt={dateStart} value={values.expirationDate || null} />
      <FormField error={errors.coverageDollars} keyboardType="decimal-pad" label={POLICY_FORM_MESSAGES.coverage} onChangeText={(coverageDollars) => onChange({ coverageDollars })} value={values.coverageDollars} />

      <View style={{ gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {POLICY_FORM_MESSAGES.costHeading}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{POLICY_FORM_MESSAGES.costBlurb}</Text>
        <FormField error={errors.premiumDollars} keyboardType="decimal-pad" label={POLICY_FORM_MESSAGES.premium} onChangeText={(premiumDollars) => onChange({ premiumDollars })} value={values.premiumDollars} />
        <PickerField hint={POLICY_FORM_MESSAGES.billedHint} label={POLICY_FORM_MESSAGES.billed} onPress={() => setIsBilledOpen(true)} value={billed} />
        <FormField
          error={errors.feesAndTaxesDollars}
          hint={POLICY_FORM_MESSAGES.feesAndTaxesHint}
          keyboardType="decimal-pad"
          label={POLICY_FORM_MESSAGES.feesAndTaxes}
          onChangeText={(feesAndTaxesDollars) => onChange({ feesAndTaxesDollars })}
          value={values.feesAndTaxesDollars}
        />
        <FormField error={errors.deductibleDollars} keyboardType="decimal-pad" label={POLICY_FORM_MESSAGES.deductible} onChangeText={(deductibleDollars) => onChange({ deductibleDollars })} value={values.deductibleDollars} />
        <FormField error={errors.windHailPct} keyboardType="decimal-pad" label={POLICY_FORM_MESSAGES.windHail} onChangeText={(windHailPct) => onChange({ windHailPct })} value={values.windHailPct} />
      </View>

      <FormField
        label={POLICY_FORM_MESSAGES.notes}
        maxLength={POLICY_NOTES_MAX_LENGTH}
        multiline
        onChangeText={(notes) => onChange({ notes })}
        placeholder={POLICY_FORM_MESSAGES.notesPlaceholder}
        value={values.notes}
      />

      <OptionSheet
        isOpen={isBilledOpen}
        onClose={() => setIsBilledOpen(false)}
        onSelect={(choice) => {
          setIsBilledOpen(false);
          onChange({ premiumFrequency: choice === NOT_BILLED ? "" : choice });
        }}
        options={[
          { value: NOT_BILLED, label: POLICY_FORM_MESSAGES.billedNone },
          ...INSURANCE_PREMIUM_FREQUENCIES.map((frequency) => ({ value: frequency, label: FREQUENCY_LABEL[frequency] })),
        ]}
        title={POLICY_FORM_MESSAGES.billedTitle}
        value={values.premiumFrequency === "" ? NOT_BILLED : values.premiumFrequency}
      />
    </>
  );
}
