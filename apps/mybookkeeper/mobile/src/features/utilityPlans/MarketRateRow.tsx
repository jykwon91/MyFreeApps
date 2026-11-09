import { describeBenchmarkFigure } from "@mybookkeeper/api-client/utils/marketRateForm";
import type { MarketRateBenchmark } from "@mybookkeeper/api-client/types/utility/market-rate-benchmark";
import { UTILITY_SERVICE_TYPE_LABELS, type UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import { fullDateLabel } from "../../lib/localDate";

interface MarketRateRowProps {
  serviceType: UtilityServiceType;
  benchmark: MarketRateBenchmark | undefined;
  /** Null for someone who can only look, so the row doesn't pretend to open an editor. */
  onPress: (() => void) | null;
}

/** One service and the rate recorded for it. */
export default function MarketRateRow({ serviceType, benchmark, onPress }: MarketRateRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const service = UTILITY_SERVICE_TYPE_LABELS[serviceType];
  const figure = benchmark ? describeBenchmarkFigure(benchmark) : MESSAGES.notRecorded;
  const detail = benchmark ? [benchmark.source, MESSAGES.seen(fullDateLabel(benchmark.observed_on)), benchmark.is_stale ? MESSAGES.stale : null].filter(Boolean).join(" · ") : null;
  return (
    <Pressable
      accessibilityLabel={[service, figure, detail].filter(Boolean).join(", ")}
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress ?? undefined}
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
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{service}</Text>
      <Text style={{ fontSize: fontSize.md, color: benchmark ? colors.foreground : colors.mutedForeground }}>{figure}</Text>
      {detail ? <Text style={{ fontSize: fontSize.sm, color: benchmark?.is_stale ? colors.destructiveText : colors.mutedForeground }}>{detail}</Text> : null}
    </Pressable>
  );
}
