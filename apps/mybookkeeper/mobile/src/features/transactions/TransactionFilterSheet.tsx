import { INCOME_CATEGORIES, EXPENSE_CATEGORY_LIST } from "@mybookkeeper/api-client/constants/transactionCategories";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { TRANSACTION_PERIODS, TRANSACTION_TYPES, UNASSIGNED_PROPERTY } from "../../constants/transactionFilters";
import type { TransactionFilters } from "../../types/TransactionFilters";
import { categoryLabel } from "./transactionDisplay";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs, fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
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
            <Section title="Period">
              {TRANSACTION_PERIODS.map((option) => (
                <OptionRow
                  isSelected={draft.period === option.value}
                  key={option.value}
                  label={option.label}
                  onPress={() => update({ period: option.value })}
                />
              ))}
            </Section>
          )}
          <Section title="Type">
            <OptionRow isSelected={draft.type === null} label="Income and expenses" onPress={() => update({ type: null })} />
            {TRANSACTION_TYPES.map((option) => (
              <OptionRow
                isSelected={draft.type === option.value}
                key={option.value}
                label={option.label}
                onPress={() => update({ type: option.value, category: null })}
              />
            ))}
          </Section>
          <Section title="Property">
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
          </Section>
          <Section title="Category">
            <OptionRow isSelected={draft.category === null} label="All categories" onPress={() => update({ category: null })} />
            {categories.map((category) => (
              <OptionRow
                isSelected={draft.category === category}
                key={category}
                label={categoryLabel(category)}
                onPress={() => update({ category })}
              />
            ))}
          </Section>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton
            onPress={() => update({ period: "all", type: null, propertyId: null, category: null })}
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
