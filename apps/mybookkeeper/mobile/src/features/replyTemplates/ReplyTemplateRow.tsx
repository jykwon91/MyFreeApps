import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { replyTemplatePreview } from "@mybookkeeper/api-client/utils/replyTemplatePreview";
import { ClampedText, LARGE_TEXT_PREVIEW_LINES, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable } from "react-native";

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
      <ClampedText numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {template.name}
      </ClampedText>
      {preview ? (
        <ClampedText largeTextNumberOfLines={LARGE_TEXT_PREVIEW_LINES} numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {preview}
        </ClampedText>
      ) : null}
    </Pressable>
  );
}
