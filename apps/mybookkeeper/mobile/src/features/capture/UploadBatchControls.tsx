import { useCancelBatchMutation, useGetBatchStatusQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { BATCH_STATUSES } from "@mybookkeeper/api-client/types/document/BatchStatus";
import { LoadingButton, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useDispatch } from "react-redux";
import {
  CANCEL_BATCH_FAILED,
  CANCEL_BATCH_LABEL,
  CANCELLING_BATCH_LABEL,
  READ_STATUS_POLL_MS,
  batchCancelledMessage,
  batchReadProgressLabel,
  batchReadingStartedMessage,
  cancelBatchAccessibilityLabel,
} from "../../constants/capture";
import type { AppDispatch } from "../../lib/store";
import { uploadBatchCancelled, uploadBatchRead } from "./uploadsSlice";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

interface UploadBatchControlsProps {
  uri: string;
  name: string;
  batchId: string;
}

/** How far the server has got reading a sent zip, and a way to stop the rest, as on the web. */
export default function UploadBatchControls({ uri, name, batchId }: UploadBatchControlsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const { currentData: batch } = useGetBatchStatusQuery(batchId, { pollingInterval: READ_STATUS_POLL_MS, skipPollingIfUnfocused: true });
  const [cancelBatch, { isLoading: isCancelling }] = useCancelBatchMutation();

  const progress = batch ? batchReadProgressLabel(batch.completed, batch.total) : "";
  // Only the start and the end are read out; a line for every check would pile up on iOS.
  const isFinished = batch?.status === BATCH_STATUSES.DONE;
  useAnnouncement(batch ? (isFinished ? progress : batchReadingStartedMessage(batch.total)) : undefined, "polite");

  useEffect(() => {
    if (batch?.status === BATCH_STATUSES.DONE) dispatch(uploadBatchRead(uri));
  }, [batch?.status, dispatch, uri]);

  async function cancel(): Promise<void> {
    try {
      await cancelBatch(batchId).unwrap();
    } catch (error) {
      if (isCancelledRequest(error)) return;
      showToast(CANCEL_BATCH_FAILED, "error");
      return;
    }
    dispatch(uploadBatchCancelled(uri));
    showToast(batchCancelledMessage(name));
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>{progress}</Text>
      <LoadingButton
        accessibilityLabel={cancelBatchAccessibilityLabel(name)}
        isLoading={isCancelling}
        loadingText={CANCELLING_BATCH_LABEL}
        onPress={cancel}
        variant="secondary"
      >
        {CANCEL_BATCH_LABEL}
      </LoadingButton>
    </View>
  );
}
