import { View } from "react-native";
import { VENDOR_MESSAGES, VENDOR_SKELETON_ROWS } from "../../constants/vendors";
import VendorSkeletonRow from "./VendorSkeletonRow";

export default function VendorsSkeleton() {
  return (
    <View accessible accessibilityLabel={VENDOR_MESSAGES.loadingList} accessibilityRole="progressbar" testID="vendors-skeleton">
      {VENDOR_SKELETON_ROWS.map((row) => (
        <VendorSkeletonRow key={row} />
      ))}
    </View>
  );
}
