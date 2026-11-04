import { useGetSignedLeaseByIdQuery, useUndoSignedLeaseExtensionMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { LeaseExtensionSummary } from "@mybookkeeper/api-client/types/lease/lease-extension-summary";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { LEASE_MESSAGES, undoBody, undoDone, undoUntil } from "../../constants/leases";
import { undoExtensionFailure } from "./undoExtensionFailure";

export default function UndoExtensionButton({ leaseId, extension }: { leaseId: string; extension: LeaseExtensionSummary }) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [undo] = useUndoSignedLeaseExtensionMutation();
  const { refetch } = useGetSignedLeaseByIdQuery(leaseId);
  const [isBusy, setIsBusy] = useState(false);
  const previous = extension.previous_ends_on ? formatLongDate(extension.previous_ends_on) : null;

  async function confirmed(): Promise<void> {
    setIsBusy(true);
    try {
      await undo({ leaseId, versionId: extension.id }).unwrap();
      showToast(undoDone(previous));
    } catch (error) {
      const known = undoExtensionFailure(error);
      if (known) {
        showToast(known, "error");
        return;
      }
      // The server commits before it answers, so a failed answer doesn't mean nothing happened.
      const latest = await refetch();
      const wentThrough = latest.isSuccess && latest.data?.latest_extension?.id !== extension.id && latest.data?.ends_on === extension.previous_ends_on;
      if (wentThrough) showToast(undoDone(previous));
      else showToast(LEASE_MESSAGES.undoFailed, "error");
    } finally {
      setIsBusy(false);
    }
  }

  function ask(): void {
    Alert.alert(LEASE_MESSAGES.undoTitle, undoBody(formatLongDate(extension.ends_on), previous), [
      { text: LEASE_MESSAGES.notNow, style: "cancel" },
      { text: LEASE_MESSAGES.undoExtension, style: "destructive", onPress: () => void confirmed() },
    ]);
  }

  return (
    <>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{undoUntil(formatLongDate(extension.undo_expires_at))}</Text>
      <LoadingButton isLoading={isBusy} loadingText={LEASE_MESSAGES.undoingExtension} onPress={ask} variant="ghost">
        {LEASE_MESSAGES.undoExtension}
      </LoadingButton>
    </>
  );
}
