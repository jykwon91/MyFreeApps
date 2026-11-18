import { LoadingRegion, Skeleton } from "@platform/mobile";
import { HOME_CHART_HEIGHT } from "../../constants/home";
import HomeCard from "./HomeCard";

export default function MonthlyChartSkeleton() {
  return (
    <HomeCard title="Month by month">
      <LoadingRegion label="Loading the months" testID="home-chart-skeleton">
        <Skeleton height={HOME_CHART_HEIGHT} />
      </LoadingRegion>
    </HomeCard>
  );
}
