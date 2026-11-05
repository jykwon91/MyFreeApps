import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

export default function ReplyTemplateDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={REPLY_TEMPLATE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="reply-template-detail-skeleton"
    >
      <Skeleton height={28} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={160} />
      <Skeleton height={100} />
    </View>
  );
}
