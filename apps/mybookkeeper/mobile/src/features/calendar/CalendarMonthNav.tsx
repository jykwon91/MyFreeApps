import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { shiftMonth } from "../../lib/localDate";
import { monthName, monthTitle } from "./calendarDisplay";
import CalendarMonthArrow from "./CalendarMonthArrow";

interface CalendarMonthNavProps {
  month: string;
  isThisMonth: boolean;
  onChange: (month: string) => void;
  onToday: () => void;
}

export default function CalendarMonthNav({ month, isThisMonth, onChange, onToday }: CalendarMonthNavProps) {
  const { colors, spacing, fontSize } = useTheme();
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <CalendarMonthArrow label={`Previous month, ${monthName(previous)}`} onPress={() => onChange(previous)} symbol="‹" />
      <Text accessibilityRole="header" adjustsFontSizeToFit numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {monthTitle(month)}
      </Text>
      <CalendarMonthArrow label={`Next month, ${monthName(next)}`} onPress={() => onChange(next)} symbol="›" />
      {isThisMonth ? null : (
        <LoadingButton onPress={onToday} variant="ghost">
          {CALENDAR_MESSAGES.today}
        </LoadingButton>
      )}
    </View>
  );
}
