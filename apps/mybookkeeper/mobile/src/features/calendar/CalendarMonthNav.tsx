import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { FILTER_MESSAGES } from "../../constants/calendarFilters";
import { shiftMonth } from "../../lib/localDate";
import { monthName, monthTitle } from "./calendarDisplay";
import CalendarMonthArrow from "./CalendarMonthArrow";

interface CalendarMonthNavProps {
  month: string;
  isThisMonth: boolean;
  onChange: (month: string) => void;
  onToday: () => void;
  onJump: () => void;
}

export default function CalendarMonthNav({ month, isThisMonth, onChange, onToday, onJump }: CalendarMonthNavProps) {
  const { colors, spacing, fontSize } = useTheme();
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <CalendarMonthArrow label={`Previous month, ${monthName(previous)}`} onPress={() => onChange(previous)} symbol="‹" />
      <Pressable
        accessibilityHint={FILTER_MESSAGES.jumpHint}
        accessibilityLabel={monthTitle(month)}
        accessibilityRole="button"
        onPress={onJump}
        style={{ flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
      >
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ textAlign: "center", fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {monthTitle(month)} ▾
        </Text>
      </Pressable>
      <CalendarMonthArrow label={`Next month, ${monthName(next)}`} onPress={() => onChange(next)} symbol="›" />
      {isThisMonth ? null : (
        <LoadingButton onPress={onToday} variant="ghost">
          {CALENDAR_MESSAGES.today}
        </LoadingButton>
      )}
    </View>
  );
}
