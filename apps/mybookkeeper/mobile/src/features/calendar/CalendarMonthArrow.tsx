import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";

interface CalendarMonthArrowProps {
  symbol: string;
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
}

export default function CalendarMonthArrow({ symbol, label, onPress, isDisabled = false }: CalendarMonthArrowProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", opacity: isDisabled ? 0.4 : 1 }}
    >
      <Text style={{ fontSize: fontSize.xl, color: colors.primary }}>{symbol}</Text>
    </Pressable>
  );
}
