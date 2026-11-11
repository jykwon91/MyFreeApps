import { formatDimensionKey } from "@myjobhunter/api-client/utils/formatDimensionKey";
import { formatDimensionStatus } from "@myjobhunter/api-client/utils/formatDimensionStatus";
import { toneForDimensionStatus } from "@myjobhunter/api-client/utils/toneForDimensionStatus";
import { Chip, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { DimensionCardProps } from "../../types/DimensionCardProps";

/** One row of the website's dimensions table, as a card: the dimension, its status, and why. */
export default function DimensionCard({ dimension }: DimensionCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
      testID="dimension-card"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" }}>
        <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "500" }}>{formatDimensionKey(dimension.key)}</Text>
        <Chip label={formatDimensionStatus(dimension.status)} tone={toneForDimensionStatus(dimension.status)} />
      </View>
      <Text selectable style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        {dimension.rationale || MESSAGES.noRationale}
      </Text>
    </View>
  );
}
