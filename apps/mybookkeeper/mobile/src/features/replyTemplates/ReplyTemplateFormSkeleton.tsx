import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

export default function ReplyTemplateFormSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={REPLY_TEMPLATE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="reply-template-form-skeleton"
    >
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={220} />
    </View>
  );
}
