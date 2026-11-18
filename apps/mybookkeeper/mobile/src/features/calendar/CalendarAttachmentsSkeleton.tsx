import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { CALENDAR_ATTACHMENT_SKELETON_ROWS, EVENT_MESSAGES } from "../../constants/calendarEventDetail";

export default function CalendarAttachmentsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={EVENT_MESSAGES.attachments} style={{ gap: spacing.md }} testID="attachments-skeleton">
      {CALENDAR_ATTACHMENT_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} width="25%" />
        </View>
      ))}
    </LoadingRegion>
  );
}
