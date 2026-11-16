import type { OfferStat } from "@mybookkeeper/api-client/types/utility/offer-stat";
import type { StatDirection } from "@mybookkeeper/api-client/types/utility/stat-direction";
import { LabelValueRow, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LABEL_COLUMN_WIDTH } from "../../constants/labelColumn";

const MARK: Record<StatDirection, string> = { better: "▼", worse: "▲", same: "—", neutral: "—" };

/** The offer's stats, label left and figure right, with how it moves against the plan held today. The arrow, the words and the colour each say it. */
export default function OfferStatList({ stats }: { stats: OfferStat[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const tone = (direction: StatDirection) => (direction === "better" ? colors.primary : direction === "worse" ? colors.destructiveText : colors.mutedForeground);
  return (
    <View style={{ gap: spacing.xs }}>
      {stats.map((stat) => (
        <LabelValueRow
          accessibilityLabel={stat.hint}
          key={stat.key}
          label={stat.label}
          labelMinWidth={LABEL_COLUMN_WIDTH}
          labelSize="sm"
          trailing={
            stat.delta ? (
              <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: tone(stat.direction) }}>
                {MARK[stat.direction]} {stat.delta}
              </Text>
            ) : null
          }
          value={stat.value}
          valueAlign="start"
          valueWeight="500"
          valueWraps
        />
      ))}
    </View>
  );
}
