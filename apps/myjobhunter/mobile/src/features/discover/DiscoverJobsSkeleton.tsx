import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES, DISCOVERED_JOB_SKELETON_CARDS } from "../../constants/discoverScreen";
import DiscoveredJobSkeletonCard from "./DiscoveredJobSkeletonCard";

/** Posting cards' stand-ins under the header while a view or saved search loads, so nothing moves when they arrive. */
export default function DiscoverJobsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loadingJobs} accessibilityRole="progressbar" style={{ gap: spacing.md }} testID="discover-jobs-skeleton">
      {DISCOVERED_JOB_SKELETON_CARDS.map((card) => (
        <DiscoveredJobSkeletonCard key={card} />
      ))}
    </View>
  );
}
