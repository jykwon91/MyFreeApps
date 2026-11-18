import { Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../constants/offline";
import { useTheme } from "../theme/useTheme";
import type { StaleDataBannerProps } from "../types/StaleDataBannerProps";
import Banner from "./Banner";

/** Tells the user a refresh failed and what's on screen is what was last loaded. */
export default function StaleDataBanner({ isShown, variant = "banner", message = SHOWING_LAST_LOADED_MESSAGE, style }: StaleDataBannerProps) {
  const { colors, fontSize } = useTheme();
  if (!isShown) return null;
  if (variant === "note") {
    return (
      <View style={style}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{message}</Text>
      </View>
    );
  }
  return <Banner message={message} style={style} />;
}
