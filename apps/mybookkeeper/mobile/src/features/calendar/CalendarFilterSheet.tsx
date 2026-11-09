import { CALENDAR_FILTER_SOURCES } from "@mybookkeeper/api-client/constants/calendarFilterSources";
import { getSourceLabel } from "@mybookkeeper/api-client/constants/calendarSources";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { FILTER_MESSAGES } from "../../constants/calendarFilters";
import type { CalendarFilters } from "../../types/CalendarFilters";
import { hasCalendarFilters, NO_CALENDAR_FILTERS, toggleValue } from "./calendarFilters";

interface CalendarFilterSheetProps {
  isOpen: boolean;
  filters: CalendarFilters;
  properties: readonly { id: string; name: string }[];
  onChange: (filters: CalendarFilters) => void;
  onClose: () => void;
}

/** Each tap filters the list straight away, so the host sees what a choice does before closing. */
export default function CalendarFilterSheet({ isOpen, filters, properties, onChange, onClose }: CalendarFilterSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const sectionTitle = { fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground, paddingHorizontal: spacing.lg, paddingTop: spacing.md } as const;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {FILTER_MESSAGES.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{FILTER_MESSAGES.done}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {properties.length > 1 ? (
            <View accessibilityLabel={FILTER_MESSAGES.properties} accessibilityRole="list">
              <Text accessibilityRole="header" style={sectionTitle}>
                {FILTER_MESSAGES.properties}
              </Text>
              {properties.map((property) => (
                <OptionRow
                  isSelected={filters.propertyIds.includes(property.id)}
                  key={property.id}
                  kind="checkbox"
                  label={property.name}
                  onPress={() => onChange({ ...filters, propertyIds: toggleValue(filters.propertyIds, property.id) })}
                />
              ))}
            </View>
          ) : null}
          <View accessibilityLabel={FILTER_MESSAGES.sources} accessibilityRole="list">
            <Text accessibilityRole="header" style={sectionTitle}>
              {FILTER_MESSAGES.sources}
            </Text>
            {CALENDAR_FILTER_SOURCES.map((source) => (
              <OptionRow
                isSelected={filters.sources.includes(source)}
                key={source}
                kind="checkbox"
                label={getSourceLabel(source)}
                onPress={() => onChange({ ...filters, sources: toggleValue(filters.sources, source) })}
              />
            ))}
          </View>
          <View style={{ padding: spacing.lg }}>
            <LoadingButton disabled={!hasCalendarFilters(filters)} onPress={() => onChange(NO_CALENDAR_FILTERS)} variant="secondary">
              {FILTER_MESSAGES.clear}
            </LoadingButton>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
