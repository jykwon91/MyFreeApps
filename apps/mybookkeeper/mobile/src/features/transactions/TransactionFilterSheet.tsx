import { TAX_RELEVANT_OPTIONS } from "@mybookkeeper/api-client/constants/taxRelevantOptions";
import { INCOME_CATEGORIES, EXPENSE_CATEGORY_LIST } from "@mybookkeeper/api-client/constants/transactionCategories";
import { TRANSACTION_SORT_FIELDS } from "@mybookkeeper/api-client/constants/transactionSort";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { NO_FILTERS, TAX_FILTER, TRANSACTION_PERIODS, TRANSACTION_TYPES, UNASSIGNED_PROPERTY } from "../../constants/transactionFilters";
import { isoFromDate, monthName } from "../../lib/localDate";
import type { TransactionFilters } from "../../types/TransactionFilters";
import FilterSheetSection from "../shell/FilterSheetSection";
import SortSections from "../shell/SortSections";
import CustomRangeFields from "./CustomRangeFields";
import { categoryLabel } from "./transactionDisplay";

/** Picking "Custom range" starts from the first of this month to today, or from the range already chosen. */
function customRangeStart(draft: TransactionFilters): Partial<TransactionFilters> {
  const today = new Date();
  return {
    period: "custom",
    month: null,
    startDate: draft.startDate ?? isoFromDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: draft.endDate ?? isoFromDate(today),
  };
}

/** Mounted only while open, so its choices start from what's applied and Close discards them. */
export default function TransactionFilterSheet({
  filters,
  properties,
  onApply,
  onClose,
}: {
  filters: TransactionFilters;
  properties: readonly Property[];
  onApply: (filters: TransactionFilters) => void;
  onClose: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(filters);
  const update = (change: Partial<TransactionFilters>) => setDraft((current) => ({ ...current, ...change }));
  const categories: readonly string[] =
    draft.type === "income"
      ? INCOME_CATEGORIES
      : draft.type === "expense"
        ? EXPENSE_CATEGORY_LIST
        : [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORY_LIST])];

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            Filters
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView>
          {draft.view === "review" ? null : (
            <FilterSheetSection title="Period">
              {/* A month comes from a link, such as a bar on Home, so it's offered only when it was applied. */}
              {filters.month ? (
                <OptionRow
                  isSelected={draft.month === filters.month}
                  label={monthName(filters.month, "long")}
                  onPress={() => update({ month: filters.month })}
                />
              ) : null}
              {TRANSACTION_PERIODS.map((option) => (
                <OptionRow
                  isSelected={draft.month === null && draft.period === option.value}
                  key={option.value}
                  label={option.label}
                  onPress={() => update({ period: option.value, month: null, startDate: null, endDate: null })}
                />
              ))}
              <OptionRow
                isSelected={draft.month === null && draft.period === "custom"}
                label="Custom range"
                onPress={() => update(customRangeStart(draft))}
              />
              {draft.month === null && draft.period === "custom" && draft.startDate && draft.endDate ? (
                <CustomRangeFields
                  endDate={draft.endDate}
                  onChange={({ startDate, endDate }) => update({ startDate, endDate })}
                  startDate={draft.startDate}
                />
              ) : null}
            </FilterSheetSection>
          )}
          <FilterSheetSection title="Type">
            <OptionRow isSelected={draft.type === null} label="Income and expenses" onPress={() => update({ type: null })} />
            {TRANSACTION_TYPES.map((option) => (
              <OptionRow
                isSelected={draft.type === option.value}
                key={option.value}
                label={option.label}
                onPress={() => update({ type: option.value, category: null })}
              />
            ))}
          </FilterSheetSection>
          <FilterSheetSection title="Property">
            <OptionRow isSelected={draft.propertyId === null} label="All properties" onPress={() => update({ propertyId: null })} />
            {properties.map((property) => (
              <OptionRow
                isSelected={draft.propertyId === property.id}
                key={property.id}
                label={property.name}
                onPress={() => update({ propertyId: property.id })}
              />
            ))}
            <OptionRow
              isSelected={draft.propertyId === UNASSIGNED_PROPERTY}
              label="No property"
              onPress={() => update({ propertyId: UNASSIGNED_PROPERTY })}
            />
          </FilterSheetSection>
          <FilterSheetSection title="Category">
            <OptionRow isSelected={draft.category === null} label="All categories" onPress={() => update({ category: null })} />
            {categories.map((category) => (
              <OptionRow
                isSelected={draft.category === category}
                key={category}
                label={categoryLabel(category)}
                onPress={() => update({ category })}
              />
            ))}
          </FilterSheetSection>
          <FilterSheetSection title={TAX_FILTER.title}>
            <OptionRow isSelected={draft.taxRelevant === null} label={TAX_FILTER.either} onPress={() => update({ taxRelevant: null })} />
            {TAX_RELEVANT_OPTIONS.map((option) => (
              <OptionRow
                isSelected={draft.taxRelevant === option.value}
                key={option.value}
                label={option.label}
                onPress={() => update({ taxRelevant: option.value })}
              />
            ))}
          </FilterSheetSection>
          {/* The review queue keeps its order, so approving walks on to the next one in it. */}
          {draft.view === "review" ? null : (
            <SortSections
              direction={draft.sortDir}
              field={draft.sortBy}
              fields={TRANSACTION_SORT_FIELDS}
              onDirectionChange={(sortDir) => update({ sortDir })}
              onFieldChange={(sortBy) => update({ sortBy })}
            />
          )}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton
            onPress={() => setDraft({ ...NO_FILTERS, view: draft.view, vendor: draft.vendor, approvedOnly: draft.approvedOnly })}
            style={{ flex: 1 }}
            variant="secondary"
          >
            Clear all
          </LoadingButton>
          <LoadingButton onPress={() => onApply(draft)} style={{ flex: 2 }}>
            Show results
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
