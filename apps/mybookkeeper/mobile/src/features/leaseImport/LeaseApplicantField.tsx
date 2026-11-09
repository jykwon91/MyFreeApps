import { useGetApplicantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { LoadingButton, OptionSheet, Skeleton, useTheme } from "@platform/mobile";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { LEASE_IMPORT_CHOICE_LIMIT, LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import { applicantName } from "../applicants/applicantDisplay";
import PickerField from "../transactions/PickerField";

interface LeaseApplicantFieldProps {
  value: string;
  onChange: (applicantId: string) => void;
  error?: string;
  disabled: boolean;
}

/** Who signed the lease. Like the website, it lists the first hundred applicants. */
export default function LeaseApplicantField({ value, onChange, error, disabled }: LeaseApplicantFieldProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { currentData, error: loadError, isLoading, refetch } = useGetApplicantsQuery({ limit: LEASE_IMPORT_CHOICE_LIMIT });
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(
    () => (currentData?.items ?? []).map((applicant) => ({ value: applicant.id, label: applicantName(applicant.legal_name) })),
    [currentData],
  );

  if (isLoading) {
    return (
      <View accessible accessibilityLabel={MESSAGES.loadingTenants} accessibilityRole="progressbar">
        <Skeleton height={56} />
      </View>
    );
  }
  if (!currentData) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{loadError ? MESSAGES.couldntLoadTenants : MESSAGES.loadingTenants}</Text>
        <LoadingButton onPress={() => void refetch()} variant="secondary">
          {MESSAGES.tryAgain}
        </LoadingButton>
      </View>
    );
  }
  if (options.length === 0) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noTenants}</Text>;

  return (
    <>
      <PickerField
        hint={currentData.has_more ? MESSAGES.moreTenants : undefined}
        label={`${MESSAGES.tenant} *`}
        onPress={() => {
          if (!disabled) setIsPicking(true);
        }}
        value={options.find((option) => option.value === value)?.label ?? MESSAGES.tenantNone}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
          {error}
        </Text>
      ) : null}
      <OptionSheet
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(applicantId) => {
          setIsPicking(false);
          onChange(applicantId);
        }}
        options={options}
        title={MESSAGES.tenantSheetTitle}
        value={value}
      />
    </>
  );
}
