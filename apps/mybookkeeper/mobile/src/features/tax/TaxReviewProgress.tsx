import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import { completenessLabel, completenessPercent, completenessTone } from "@mybookkeeper/api-client/utils/taxCompleteness";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../../constants/taxReview";

/** How much of a form was found: the status word, "x of y found", and a bar. The words carry it, the bar is a bonus. */
export default function TaxReviewProgress({ form }: { form: Pick<FormCompleteness, "total_filled" | "total_expected"> }) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const percent = completenessPercent(form);
  const tone = completenessTone(percent);
  const fill = tone === "complete" ? colors.primary : tone === "partial" ? colors.mutedForeground : colors.destructive;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {`${completenessLabel(percent)} · ${MESSAGES.filled(form.total_filled, form.total_expected)}`}
      </Text>
      <View style={{ height: 6, borderRadius: radius.sm, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ width: `${percent}%`, height: "100%", backgroundColor: fill }} />
      </View>
    </View>
  );
}
