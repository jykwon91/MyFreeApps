import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";

interface TransactionFactRetryProps {
  label: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/** A fact that couldn't load, with a control to try again. */
export default function TransactionFactRetry({ label, message, retryLabel, onRetry }: TransactionFactRetryProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Pressable
        accessibilityLabel={retryLabel}
        accessibilityRole="button"
        onPress={onRetry}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{message}</Text>
      </Pressable>
    </View>
  );
}
