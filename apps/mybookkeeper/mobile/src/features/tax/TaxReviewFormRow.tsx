import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import { completenessLabel, completenessPercent } from "@mybookkeeper/api-client/utils/taxCompleteness";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../../constants/taxReview";
import { reviewFormTitle } from "./taxReviewDisplay";
import TaxReviewProgress from "./TaxReviewProgress";

/** One form's progress at a glance. Opens what was found and what wasn't. */
export default function TaxReviewFormRow({ form, onPress }: { form: FormCompleteness; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const title = reviewFormTitle(form);
  const lines = form.highlights.length > 0 ? form.highlights : [MESSAGES.nothingToPointOut];
  return (
    <Pressable
      accessibilityHint={MESSAGES.rowHint}
      accessibilityLabel={`${title}. ${completenessLabel(completenessPercent(form))}, ${MESSAGES.filled(form.total_filled, form.total_expected)}. ${lines.join(" ")}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      <TaxReviewProgress form={form} />
      {lines.map((line) => (
        <Text key={line} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}
