import { View } from "react-native";
import { LISTING_MESSAGES, LISTING_SKELETON_ROWS } from "../../constants/listings";
import ListingSkeletonRow from "./ListingSkeletonRow";

export default function ListingsSkeleton() {
  return (
    <View accessible accessibilityLabel={LISTING_MESSAGES.loadingList} accessibilityRole="progressbar" testID="listings-skeleton">
      {LISTING_SKELETON_ROWS.map((row) => (
        <ListingSkeletonRow key={row} />
      ))}
    </View>
  );
}
