import { DEFAULT_FILING_STATUS, FILING_STATUSES } from "@mybookkeeper/api-client/constants/taxFilingStatuses";
import { taxReturnYearChoices } from "@mybookkeeper/api-client/utils/taxReturnYearChoices";
import { Banner, EmptyState, LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import { TAX_RETURN_CREATE_MESSAGES as MESSAGES } from "../../constants/taxReturnCreate";
import { useDiscardPrompt } from "../../lib/useDiscardPrompt";
import { useToday } from "../../lib/useToday";
import PickerField from "../transactions/PickerField";
import { useIsAdmin } from "../workspace/useIsAdmin";
import { useCreateTaxReturn } from "./useCreateTaxReturn";

/** Starts a tax return for a year. Owners and admins only, as the server decides. */
export default function TaxReturnCreateScreen() {
  const { spacing } = useTheme();
  const isAdmin = useIsAdmin();
  const today = useToday();
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [filingStatus, setFilingStatus] = useState<string>(DEFAULT_FILING_STATUS);
  const [sheet, setSheet] = useState<"year" | "status" | null>(null);
  const { create, isBusy, isLeaving, failure } = useCreateTaxReturn();
  const locked = isBusy || isLeaving;

  useDiscardPrompt((year !== currentYear || filingStatus !== DEFAULT_FILING_STATUS) && !isLeaving, isBusy);

  if (!isAdmin) return <EmptyState body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} />;

  const statusLabel = FILING_STATUSES.find((option) => option.value === filingStatus)?.label ?? filingStatus;
  const close = () => setSheet(null);
  return (
    <>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
        {failure ? <Banner message={failure} /> : null}
        <PickerField disabled={locked} hint={MESSAGES.yearHint} label={MESSAGES.year} onPress={() => setSheet("year")} value={String(year)} />
        <PickerField disabled={locked} hint={MESSAGES.filingStatusHint} label={MESSAGES.filingStatus} onPress={() => setSheet("status")} value={statusLabel} />
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={MESSAGES.creating} onPress={() => void create({ taxYear: year, filingStatus })}>
          {MESSAGES.create}
        </LoadingButton>
      </ScrollView>
      <OptionSheet
        isOpen={sheet === "year"}
        onClose={close}
        onSelect={(chosen) => {
          close();
          setYear(Number(chosen));
        }}
        options={taxReturnYearChoices().map((choice) => ({ value: String(choice), label: String(choice) }))}
        title={MESSAGES.year}
        value={String(year)}
      />
      <OptionSheet
        isOpen={sheet === "status"}
        onClose={close}
        onSelect={(chosen) => {
          close();
          setFilingStatus(chosen);
        }}
        options={FILING_STATUSES.map((option) => ({ value: option.value, label: option.label }))}
        title={MESSAGES.filingStatus}
        value={filingStatus}
      />
    </>
  );
}
