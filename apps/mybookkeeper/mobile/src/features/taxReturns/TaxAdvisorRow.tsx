import { useGetAdvisorSuggestionsQuery } from "@mybookkeeper/api-client/store/taxReturnsApi";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Pressable, Text } from "react-native";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";
import { useIsAdmin } from "../workspace/useIsAdmin";
import { advisorGlance } from "./taxAdvisorDisplay";

/** The advisor at a glance: how many suggestions are waiting. Opens the advisor. */
export default function TaxAdvisorRow({ returnId, onPress }: { returnId: string; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const isAdmin = useIsAdmin();
  const { currentData, error } = useGetAdvisorSuggestionsQuery(returnId);
  // Nothing cached yet answers 404. Any other failure just leaves the line off, and the advisor screen says what went wrong.
  const glance = advisorGlance(currentData, isNotFound(error), isAdmin);
  return (
    <Pressable
      accessibilityHint={MESSAGES.entryHint}
      accessibilityLabel={glance ? `${MESSAGES.title}, ${glance}` : MESSAGES.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{MESSAGES.title}</Text>
      {glance ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{glance}</Text> : null}
    </Pressable>
  );
}
