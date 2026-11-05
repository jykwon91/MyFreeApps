import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { REPLY_TEMPLATE_MESSAGES, REPLY_TEMPLATE_SKELETON_ROWS } from "../../constants/replyTemplates";

interface ReplyTemplatesSkeletonProps {
  label?: string;
  /** Room for the line of text the archived list shows above its rows. */
  hasHeader?: boolean;
}

export default function ReplyTemplatesSkeleton({ label = REPLY_TEMPLATE_MESSAGES.loadingList, hasHeader = false }: ReplyTemplatesSkeletonProps) {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" testID="reply-templates-skeleton">
      {hasHeader ? (
        <View style={{ gap: spacing.xs, padding: spacing.lg }}>
          <Skeleton height={14} width="95%" />
          <Skeleton height={14} width="60%" />
        </View>
      ) : null}
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
