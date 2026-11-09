import { Skeleton } from "@platform/mobile";
import { View } from "react-native";
import { HOME_CHART_HEIGHT } from "../../constants/home";
import HomeCard from "./HomeCard";

export default function MonthlyChartSkeleton() {
  return (
    <HomeCard title="Month by month">
      <View accessibilityLabel="Loading the months" accessible testID="home-chart-skeleton">
        <Skeleton height={HOME_CHART_HEIGHT} />
      </View>
    </HomeCard>
  );
}
