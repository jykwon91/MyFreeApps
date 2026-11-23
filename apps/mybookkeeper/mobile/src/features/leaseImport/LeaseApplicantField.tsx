import { FieldError, LoadingRegion, OptionSheet, PickerField, SectionError, Skeleton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { pickerLoadError } from "../../lib/pickerLoadError";
import { useApplicantChoices } from "../applicants/useApplicantChoices";
import PagedChoicesFooter from "../shell/PagedChoicesFooter";

interface LeaseApplicantFieldProps {
  value: string;
  onChange: (applicantId: string) => void;
  error?: string;
  disabled: boolean;
}

/** Who signed the lease: any applicant, more loading as the sheet nears its end. */
export default function LeaseApplicantField({ value, onChange, error, disabled }: LeaseApplicantFieldProps) {
  const { colors, fontSize } = useTheme();
  const choices = useApplicantChoices();
  const { options, hasData, error: loadError, refetch } = choices;
  const [isPicking, setIsPicking] = useState(false);

  const failure = pickerLoadError({ hasLoaded: hasData, error: loadError, refetch }, MESSAGES.couldntLoadTenants);
  if (failure) return <SectionError {...failure} />;
  if (!hasData) {
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
        disabled={disabled}
        error={error}
        label={MESSAGES.tenant}
        onPress={() => setIsPicking(true)}
        required
        valueLabel={options.find((option) => option.value === value)?.label ?? MESSAGES.tenantNone}
      />
      <FieldError message={error} name={MESSAGES.tenant} />
      <OptionSheet
        footer={<PagedChoicesFooter choices={choices} loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreApplicants} />}
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onEndReached={choices.loadMoreIfAny}
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
