import { MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { CALENDAR_JUMP_YEARS_AHEAD, CALENDAR_JUMP_YEARS_BACK, CALENDAR_MONTH_NUMBERS, FILTER_MESSAGES } from "../../constants/calendarFilters";
import { monthFromParts, monthLabelFor, yearBounds } from "./calendarJump";
import CalendarMonthArrow from "./CalendarMonthArrow";

interface CalendarJumpSheetProps {
  isOpen: boolean;
  month: string;
  thisMonth: string;
  onJump: (month: string) => void;
  onClose: () => void;
}

/** A year with arrows and the twelve months under it, so any month is two taps away. */
export default function CalendarJumpSheet({ isOpen, month, thisMonth, onJump, onClose }: CalendarJumpSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const bounds = yearBounds(thisMonth, CALENDAR_JUMP_YEARS_BACK, CALENDAR_JUMP_YEARS_AHEAD);
  const year = Number(month.slice(0, 4));
  const shownMonth = Number(month.slice(5, 7));

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {FILTER_MESSAGES.jumpTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{FILTER_MESSAGES.done}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.xs }}>
          <CalendarMonthArrow
            isDisabled={year <= bounds.first}
            label={FILTER_MESSAGES.previousYear}
            onPress={() => onJump(monthFromParts(year - 1, shownMonth))}
            symbol="‹"
          />
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: "center", fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {year}
          </Text>
          <CalendarMonthArrow
            isDisabled={year >= bounds.last}
            label={FILTER_MESSAGES.nextYear}
            onPress={() => onJump(monthFromParts(year + 1, shownMonth))}
            symbol="›"
          />
        </View>
        <ScrollView accessibilityRole="radiogroup">
          {CALENDAR_MONTH_NUMBERS.map((number) => (
            <OptionRow
              isSelected={number === shownMonth}
              key={number}
              label={monthLabelFor(year, number)}
              onPress={() => {
                onJump(monthFromParts(year, number));
                onClose();
              }}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
