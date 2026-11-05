import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { replyTemplatePreview } from "@mybookkeeper/api-client/utils/replyTemplatePreview";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";

interface ReplyTemplateRowProps {
  template: ReplyTemplate;
  onPress: () => void;
}

export default function ReplyTemplateRow({ template, onPress }: ReplyTemplateRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const preview = replyTemplatePreview(template.body_template);
  return (
    <Pressable
      accessibilityLabel={preview ? `${template.name}. ${preview}` : template.name}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {template.name}
      </Text>
      {preview ? (
        <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {preview}
        </Text>
      ) : null}
    </Pressable>
  );
}
