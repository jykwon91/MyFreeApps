import { LoadingButton, useTheme } from "@platform/mobile";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { HIDDEN_NUMBER_MESSAGES } from "../../constants/hiddenNumber";
import { maskedNumber } from "../../lib/maskedNumber";

interface HiddenNumberProps {
  label: string;
  value: string;
}

/** Hidden until asked for, and again on leaving the app, since people glance at these screens with others around. */
export default function HiddenNumber({ label, value }: HiddenNumberProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isShown, setIsShown] = useState(false);
  const action = isShown ? HIDDEN_NUMBER_MESSAGES.hide : HIDDEN_NUMBER_MESSAGES.show;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setIsShown(false);
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
        <Text selectable={isShown} style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {isShown ? value : maskedNumber(value)}
        </Text>
      </View>
      <LoadingButton
        accessibilityLabel={`${action} the full ${label.toLowerCase()}`}
        onPress={() => setIsShown((shown) => !shown)}
        variant="ghost"
      >
        {action}
      </LoadingButton>
    </View>
  );
}
