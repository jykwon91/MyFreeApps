import { useDeleteWorkHistoryMutation } from "@myjobhunter/api-client/store/workHistoryApi";
import { formatWorkDateRange } from "@myjobhunter/api-client/utils/formatWorkDateRange";
import { useConfirmedRemoval, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { WORK_HISTORY_MESSAGES as MESSAGES } from "../../constants/profileWorkHistory";
import type { WorkHistoryCardProps } from "../../types/WorkHistoryCardProps";
import CardActions from "./CardActions";

/** A role: title, company, dates and bullets, then Edit and Remove. */
export default function WorkHistoryCard({ entry, onEdit }: WorkHistoryCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [deleteWorkHistory] = useDeleteWorkHistoryMutation();
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => deleteWorkHistory(entry.id).unwrap(), {
    ...MESSAGES,
    remove: PROFILE_MESSAGES.remove,
    keep: PROFILE_MESSAGES.keep,
  });
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`work-history-${entry.id}`}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{entry.title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{entry.company_name}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatWorkDateRange(entry.start_date, entry.end_date, entry.is_current)}</Text>
      {entry.bullets.map((bullet, index) => (
        // Bullets can repeat, so their place in the list is part of the key.
        <Text key={`${index}-${bullet}`} selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {`• ${bullet}`}
        </Text>
      ))}
      <CardActions isRemoving={isRemoving} onEdit={onEdit} onRemove={confirmRemove} subject={entry.company_name} />
    </View>
  );
}
