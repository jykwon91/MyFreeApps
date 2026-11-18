import { LoadingRegion, MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { HOME_CATEGORY_SKELETON_ROWS } from "../../constants/home";
import HomeCard from "./HomeCard";

export default function WhereItWentSkeleton() {
  const { spacing } = useTheme();
  return (
    <HomeCard title="Where it went">
      <LoadingRegion label="Loading where your money went" style={{ gap: spacing.md }} testID="home-categories-skeleton">
        {HOME_CATEGORY_SKELETON_ROWS.map((row) => (
          <Skeleton height={MIN_TOUCH_TARGET} key={row} />
        ))}
      </LoadingRegion>
    </HomeCard>
  );
}
