import { EXPENSE_CATEGORY_LIST, REVENUE_CATEGORIES } from "@mybookkeeper/api-client/constants/transactionCategories";
import type { CategoryPreset } from "@mybookkeeper/api-client/types/analytics/category-preset";
import { categoriesForPreset, detectCategoryPreset, isCategoryFilterActive, toggleCategory } from "@mybookkeeper/api-client/utils/categoryFilter";
import { MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { categoryLabel } from "../transactions/transactionDisplay";
import { CATEGORY_PRESETS } from "./categoryFilterDisplay";

interface CategoryFilterSheetProps {
  isOpen: boolean;
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  onClose: () => void;
}

const SECTIONS: readonly { heading: string; categories: readonly string[] }[] = [
  { heading: MESSAGES.income, categories: [...REVENUE_CATEGORIES, "security_deposit"] },
  { heading: MESSAGES.expenses, categories: EXPENSE_CATEGORY_LIST },
];

/** Each tap counts straight away. A preset sets the whole list; a row adds or drops one; Only keeps just that one. */
export default function CategoryFilterSheet({ isOpen, selected, onChange, onClose }: CategoryFilterSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const preset: CategoryPreset = isCategoryFilterActive(selected) ? detectCategoryPreset(selected) : "all";
  const presetIsExact = !isCategoryFilterActive(selected) || detectCategoryPreset(selected) !== "all";
  const sectionTitle = { fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground, paddingHorizontal: spacing.lg, paddingTop: spacing.md } as const;

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={isOpen}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.categoriesSheetTitle}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.done}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {CATEGORY_PRESETS.map((option) => (
            <OptionRow isSelected={presetIsExact && preset === option.key} key={option.key} label={option.label} onPress={() => onChange(categoriesForPreset(option.key))} />
          ))}
          {SECTIONS.map((section) => (
            <View accessibilityLabel={section.heading} accessibilityRole="list" key={section.heading}>
              <Text accessibilityRole="header" style={sectionTitle}>
                {section.heading}
              </Text>
              {section.categories.map((category) => (
                <View key={category} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <OptionRow isSelected={selected.has(category)} kind="checkbox" label={categoryLabel(category)} onPress={() => onChange(toggleCategory(selected, category))} />
                  </View>
                  <Pressable
                    accessibilityHint={MESSAGES.onlyHint}
                    accessibilityLabel={`${MESSAGES.only} ${categoryLabel(category)}`}
                    accessibilityRole="button"
                    onPress={() => onChange(new Set([category]))}
                    style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}
                  >
                    <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{MESSAGES.only}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
