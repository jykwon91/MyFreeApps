import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../../constants/taxReview";
import { reviewFormTitle } from "./taxReviewDisplay";

export default function TaxReviewFormRow({ form }: { form: FormCompleteness }) {
  const { colors, spacing, fontSize } = useTheme();
  const title = reviewFormTitle(form);
  const lines = form.highlights.length > 0 ? form.highlights : [MESSAGES.nothingToPointOut];
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${lines.join(" ")}`}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {line}
        </Text>
      ))}
    </View>
  );
}
