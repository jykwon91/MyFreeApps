import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";

interface CalendarMonthArrowProps {
  symbol: string;
  label: string;
  onPress: () => void;
}

export default function CalendarMonthArrow({ symbol, label, onPress }: CalendarMonthArrowProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: fontSize.xl, color: colors.primary }}>{symbol}</Text>
    </Pressable>
  );
}
