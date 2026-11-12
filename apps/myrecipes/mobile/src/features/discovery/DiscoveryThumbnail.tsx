import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { Image, View } from "react-native";
import { API_BASE_URL } from "../../constants/api";

/**
 * A discovered recipe's picture, or a plain tile of the same shape. The pictures live on other
 * people's servers and come through our image proxy, so a share of them will be gone or blocked,
 * and the model returns none rather than guess. Either way the card keeps its shape.
 */
export default function DiscoveryThumbnail({
  path,
  aspectRatio,
  isRounded = false,
}: {
  path: string | null;
  aspectRatio: number;
  /** Off inside a card, whose own corners clip the picture. */
  isRounded?: boolean;
}) {
  const { colors, radius } = useTheme();
  const [hasFailed, setHasFailed] = useState(false);
  const style = { width: "100%", aspectRatio, borderRadius: isRounded ? radius.md : 0, backgroundColor: colors.muted } as const;

  if (!path || hasFailed) return <View style={style} testID="discovery-thumbnail-placeholder" />;
  return (
    <Image
      accessibilityIgnoresInvertColors
      onError={() => setHasFailed(true)}
      resizeMode="cover"
      source={{ uri: `${API_BASE_URL}${path}` }}
      style={style}
      testID="discovery-thumbnail"
    />
  );
}
