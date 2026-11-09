import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { HOME_CATEGORY_SKELETON_ROWS } from "../../constants/home";
import HomeCard from "./HomeCard";

export default function WhereItWentSkeleton() {
  const { spacing } = useTheme();
  return (
    <HomeCard title="Where it went">
      <View accessibilityLabel="Loading where your money went" accessible style={{ gap: spacing.md }} testID="home-categories-skeleton">
        {HOME_CATEGORY_SKELETON_ROWS.map((row) => (
          <Skeleton height={MIN_TOUCH_TARGET} key={row} />
        ))}
      </View>
    </HomeCard>
  );
}
