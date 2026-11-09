import { formatFileSize } from "@mybookkeeper/api-client/utils/file-size";
import type { ListingBlackoutAttachment } from "@mybookkeeper/api-client/types/calendar/listing-blackout-attachment";
import { useDeleteBlackoutAttachmentMutation } from "@mybookkeeper/api-client/store/calendarApi";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Alert, Text, View } from "react-native";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import { attachmentRemoveFailure } from "./calendarEventFailures";

interface CalendarAttachmentRowProps {
  file: ListingBlackoutAttachment;
  canWrite: boolean;
  isOpening: boolean;
  isOpenDisabled: boolean;
  onOpen: () => void;
}

export default function CalendarAttachmentRow({ file, canWrite, isOpening, isOpenDisabled, onOpen }: CalendarAttachmentRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [deleteAttachment, { isLoading: isRemoving }] = useDeleteBlackoutAttachmentMutation();

  function confirmRemove(): void {
    Alert.alert(EVENT_MESSAGES.removeTitle, EVENT_MESSAGES.removeBody, [
      { text: EVENT_MESSAGES.cancel, style: "cancel" },
      {
        text: EVENT_MESSAGES.remove,
        style: "destructive",
        onPress: () => void remove(),
      },
    ]);
  }

  async function remove(): Promise<void> {
    try {
      await deleteAttachment({ blackoutId: file.listing_blackout_id, attachmentId: file.id }).unwrap();
      showToast(EVENT_MESSAGES.removed);
    } catch (error) {
      showToast(attachmentRemoveFailure(error), "error");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.filename}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatFileSize(file.size_bytes)}</Text>
      </View>
      {file.is_available === false ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{EVENT_MESSAGES.fileMissing}</Text>
      ) : (
        <LoadingButton
          accessibilityLabel={`${EVENT_MESSAGES.open} ${file.filename}`}
          disabled={isOpenDisabled || isRemoving}
          isLoading={isOpening}
          loadingText={EVENT_MESSAGES.opening}
          onPress={onOpen}
          variant="secondary"
        >
          {EVENT_MESSAGES.open}
        </LoadingButton>
      )}
      {canWrite ? (
        <LoadingButton
          accessibilityLabel={`${EVENT_MESSAGES.remove} ${file.filename}`}
          disabled={isOpening}
          isLoading={isRemoving}
          loadingText={EVENT_MESSAGES.removing}
          onPress={confirmRemove}
          variant="destructive"
        >
          {EVENT_MESSAGES.remove}
        </LoadingButton>
      ) : null}
    </View>
  );
}
