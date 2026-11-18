import { useGetApplicantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { FieldError, LoadingRegion, OptionSheet, SectionError, Skeleton, useTheme } from "@platform/mobile";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { LEASE_IMPORT_CHOICE_LIMIT, LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import { pickerLoadError } from "../../lib/pickerLoadError";
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
  const { colors, fontSize } = useTheme();
  const { currentData, error: loadError, isLoading, refetch } = useGetApplicantsQuery({ limit: LEASE_IMPORT_CHOICE_LIMIT });
  const [isPicking, setIsPicking] = useState(false);
  const options = useMemo(
    () => (currentData?.items ?? []).map((applicant) => ({ value: applicant.id, label: applicantName(applicant.legal_name) })),
    [currentData],
  );

  const failure = pickerLoadError({ hasLoaded: currentData !== undefined, error: loadError, refetch }, MESSAGES.couldntLoadTenants);
  if (failure) return <SectionError {...failure} />;
  if (isLoading || !currentData) {
    return (
      <LoadingRegion label={MESSAGES.loadingTenants}>
        <Skeleton height={56} />
      </LoadingRegion>
    );
  }
  if (options.length === 0) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noTenants}</Text>;

  return (
    <>
      <PickerField
        error={error}
        hint={currentData.has_more ? MESSAGES.moreTenants : undefined}
        label={`${MESSAGES.tenant} *`}
        onPress={() => {
          if (!disabled) setIsPicking(true);
        }}
        value={options.find((option) => option.value === value)?.label ?? MESSAGES.tenantNone}
      />
      <FieldError message={error} name={MESSAGES.tenant} />
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
