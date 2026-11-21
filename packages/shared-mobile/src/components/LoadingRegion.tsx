import { View } from "react-native";
import { LOADING_REGION_DEFAULT_LABEL } from "../constants/loadingRegion";
import type { LoadingRegionProps } from "../types/LoadingRegionProps";

/**
 * Wraps a loading skeleton so a screen reader finds one busy progress indicator read by its label,
 * since the Skeleton bars inside hide themselves. Wrap the outermost skeleton a screen shows, not each row.
 */
export default function LoadingRegion({ children, label = LOADING_REGION_DEFAULT_LABEL, style, testID }: LoadingRegionProps) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={style}
      testID={testID}
    >
      {children}
    </View>
  );
}
