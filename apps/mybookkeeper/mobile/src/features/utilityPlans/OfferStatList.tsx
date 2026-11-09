import type { OfferStat } from "@mybookkeeper/api-client/types/utility/offer-stat";
import type { StatDirection } from "@mybookkeeper/api-client/types/utility/stat-direction";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

const MARK: Record<StatDirection, string> = { better: "▼", worse: "▲", same: "—", neutral: "—" };

/** The offer's stats, label left and figure right, with how it moves against the plan held today. The arrow, the words and the colour each say it. */
export default function OfferStatList({ stats }: { stats: OfferStat[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const tone = (direction: StatDirection) => (direction === "better" ? colors.primary : direction === "worse" ? colors.destructiveText : colors.mutedForeground);
  return (
    <View style={{ gap: spacing.xs }}>
      {stats.map((stat) => (
        <View accessible accessibilityLabel={stat.hint} key={stat.key} style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text style={{ width: 96, fontSize: fontSize.sm, color: colors.mutedForeground }}>{stat.label}</Text>
          <Text style={{ fontSize: fontSize.md, fontWeight: "500", color: colors.foreground }}>{stat.value}</Text>
          {stat.delta ? (
            <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: tone(stat.direction) }}>
              {MARK[stat.direction]} {stat.delta}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
