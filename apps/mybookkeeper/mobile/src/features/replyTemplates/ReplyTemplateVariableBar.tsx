import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REPLY_TEMPLATE_MESSAGES, REPLY_TEMPLATE_VARIABLES } from "../../constants/replyTemplates";
import type { ReplyTemplateField } from "../../types/ReplyTemplateField";

interface ReplyTemplateVariableBarProps {
  field: ReplyTemplateField;
  onInsert: (token: string) => void;
  /** Off while saving, so what's kept on a failed save is what was sent. */
  disabled: boolean;
}

/** Sits above the keyboard. A tap here leaves the keyboard up, so a variable lands where the cursor is. */
export default function ReplyTemplateVariableBar({ field, onInsert, disabled }: ReplyTemplateVariableBarProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        gap: spacing.xs,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom + spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ paddingHorizontal: spacing.lg, fontSize: fontSize.xs, color: colors.mutedForeground }}>
        {field === "body" ? REPLY_TEMPLATE_MESSAGES.addToMessage : REPLY_TEMPLATE_MESSAGES.addToSubject}
      </Text>
      <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        {REPLY_TEMPLATE_VARIABLES.map(({ token, fillsIn }) => (
          <Pressable
            accessibilityHint={fillsIn}
            accessibilityLabel={`Add ${token}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            key={token}
            onPress={() => onInsert(token)}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: "center",
              paddingHorizontal: spacing.md,
              borderWidth: 1,
              borderRadius: radius.md,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.muted : colors.background,
              opacity: disabled ? 0.5 : 1,
            })}
          >
            <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{token}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
