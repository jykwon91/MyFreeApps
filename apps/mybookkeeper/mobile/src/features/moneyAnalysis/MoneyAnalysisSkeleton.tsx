import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES, MONEY_ANALYSIS_SKELETON_ROWS } from "../../constants/moneyAnalysis";
import HomeCard from "../home/HomeCard";

/** The shape of the loaded screen: totals, a chart, then rows. */
export default function MoneyAnalysisSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel={MESSAGES.loading} accessible style={{ gap: spacing.lg }} testID="analysis-skeleton">
      <HomeCard>
        <Skeleton height={14} width="20%" />
        <Skeleton height={36} width="55%" />
        <Skeleton height={44} width="70%" />
      </HomeCard>
      <HomeCard>
        <Skeleton height={14} width="35%" />
        <Skeleton height={160} width="100%" />
      </HomeCard>
      <HomeCard>
        {MONEY_ANALYSIS_SKELETON_ROWS.map((row) => (
          <Skeleton height={20} key={row} width="100%" />
        ))}
      </HomeCard>
    </View>
  );
}
