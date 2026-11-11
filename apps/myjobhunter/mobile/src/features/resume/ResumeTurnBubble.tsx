import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeTurnBubbleProps } from "../../types/ResumeTurnBubbleProps";

/** One chat bubble: the person's on the right, the assistant's on the left. */
export default function ResumeTurnBubble({ body, isUser, caption }: ResumeTurnBubbleProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const speaker = isUser ? MESSAGES.you : MESSAGES.assistant;
  return (
    <View accessible accessibilityLabel={`${speaker}: ${body}${caption ? `, ${caption}` : ""}`} style={{ alignItems: isUser ? "flex-end" : "flex-start", gap: 2 }}>
      <View
        style={{
          maxWidth: "85%",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md * 2,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isUser ? colors.secondary : colors.muted,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{body}</Text>
      </View>
      {caption ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{caption}</Text> : null}
    </View>
  );
}
