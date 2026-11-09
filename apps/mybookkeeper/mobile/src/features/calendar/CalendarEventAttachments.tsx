import { useGetBlackoutAttachmentsQuery, useLazyGetBlackoutAttachmentsQuery } from "@mybookkeeper/api-client/store/calendarApi";
import type { ListingBlackoutAttachment } from "@mybookkeeper/api-client/types/calendar/listing-blackout-attachment";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";
import { useOpenFreshAttachment } from "../documents/useOpenFreshAttachment";
import CalendarAttachmentRow from "./CalendarAttachmentRow";
import CalendarAttachmentsSkeleton from "./CalendarAttachmentsSkeleton";
import CalendarAttachmentUpload from "./CalendarAttachmentUpload";

export default function CalendarEventAttachments({ blackoutId, canWrite }: { blackoutId: string; canWrite: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: files, error, isFetching, refetch } = useGetBlackoutAttachmentsQuery(blackoutId);
  const [fetchFiles] = useLazyGetBlackoutAttachmentsQuery();
  const { open, openingId } = useOpenFreshAttachment<ListingBlackoutAttachment>(() => fetchFiles(blackoutId).unwrap(), EVENT_MESSAGES.couldntOpen);
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground };

  function list() {
    if (!files) {
      if (error && !isFetching) {
        return (
          <View style={{ gap: spacing.sm }}>
            <Text style={muted}>{EVENT_MESSAGES.attachmentsFailed}</Text>
            <LoadingButton isLoading={isFetching} onPress={() => void refetch()} variant="secondary">
              {EVENT_MESSAGES.retry}
            </LoadingButton>
          </View>
        );
      }
      return <CalendarAttachmentsSkeleton />;
    }
    if (files.length === 0) return <Text style={muted}>{EVENT_MESSAGES.noAttachments}</Text>;
    return files.map((file) => (
      <CalendarAttachmentRow
        canWrite={canWrite}
        file={file}
        isOpenDisabled={openingId !== null}
        isOpening={openingId === file.id}
        key={file.id}
        onOpen={() => void open(file)}
      />
    ));
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {EVENT_MESSAGES.attachments}
      </Text>
      {list()}
      {canWrite ? <CalendarAttachmentUpload blackoutId={blackoutId} /> : null}
    </View>
  );
}
