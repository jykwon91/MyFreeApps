import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePendingPress } from "../hooks/usePendingPress";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { BannerAction } from "../types/BannerProps";

interface BannerActionButtonProps extends BannerAction {
  foreground: string;
}

export default function BannerActionButton({ label, accessibilityHint, onPress, foreground }: BannerActionButtonProps) {
  const { spacing, fontSize } = useTheme();
  const { isPending, press } = usePendingPress(onPress);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: isPending, busy: isPending }}
      disabled={isPending}
      onPress={press}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isPending ? (
        <View style={{ marginRight: spacing.sm }}>
          <ActivityIndicator color={foreground} size="small" testID="banner-action-spinner" />
        </View>
      ) : null}
      <Text style={{ color: foreground, fontSize: fontSize.sm, fontWeight: "600", textDecorationLine: "underline" }}>
        {label}
      </Text>
    </Pressable>
  );
}
