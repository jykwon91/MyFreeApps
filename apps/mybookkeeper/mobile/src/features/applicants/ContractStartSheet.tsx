import { useUpdateApplicantContractDatesMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import { Banner, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text } from "react-native";
import { isoFromDate } from "../../lib/localDate";
import DatePicker from "../shell/DatePicker";
import { contractStartFailure } from "./applicantFailures";

export default function ContractStartSheet({
  applicantId,
  isOpen,
  onClose,
  value,
}: {
  applicantId: string;
  isOpen: boolean;
  onClose: () => void;
  value: string | null;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [updateDates, { isLoading }] = useUpdateApplicantContractDatesMutation();
  // Null until something's picked, so reopening starts from the saved date.
  const [picked, setPicked] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const isSaving = useRef(false);
  const shown = picked ?? value ?? isoFromDate(new Date());

  function close(): void {
    if (isLoading) return;
    setPicked(null);
    setFailure(null);
    onClose();
  }

  async function save(next: string | null, success: string): Promise<void> {
    if (isSaving.current) return;
    isSaving.current = true;
    setFailure(null);
    try {
      await updateDates({ applicantId, data: { contract_start: next } }).unwrap();
      showToast(success);
      setPicked(null);
      onClose();
    } catch (error) {
      setFailure(contractStartFailure(error));
    } finally {
      isSaving.current = false;
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={isOpen}>
      <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          Contract start
        </Text>
        {failure ? <Banner message={failure} /> : null}
        <DatePicker label="Contract start" onChange={setPicked} value={shown} />
        <LoadingButton disabled={isLoading || shown === value} isLoading={isLoading} loadingText="Saving…" onPress={() => void save(shown, "Contract start saved.")}>
          Save
        </LoadingButton>
        {value ? (
          <LoadingButton disabled={isLoading} onPress={() => void save(null, "Contract start cleared.")} variant="secondary">
            Clear date
          </LoadingButton>
        ) : null}
        <LoadingButton disabled={isLoading} onPress={close} variant="ghost">
          Cancel
        </LoadingButton>
      </ScrollView>
    </Modal>
  );
}
