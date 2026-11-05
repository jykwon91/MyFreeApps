import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { REPLY_TEMPLATE_MESSAGES, REPLY_TEMPLATE_SKELETON_ROWS } from "../../constants/replyTemplates";

export default function ReplyTemplatesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={REPLY_TEMPLATE_MESSAGES.loadingList} accessibilityRole="progressbar" testID="reply-templates-skeleton">
      {REPLY_TEMPLATE_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="55%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="70%" />
        </View>
      ))}
    </View>
  );
}
