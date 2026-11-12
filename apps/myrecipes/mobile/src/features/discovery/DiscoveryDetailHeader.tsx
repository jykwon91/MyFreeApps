import type { DiscoverySourceType } from "@myrecipes/api-client/types/recipe/discovery";
import { hostLabel } from "@myrecipes/api-client/utils/hostLabel";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DISCOVERY_DETAIL_IMAGE_ASPECT } from "../../constants/discovery";
import DiscoverySourceLine from "./DiscoverySourceLine";
import DiscoveryThumbnail from "./DiscoveryThumbnail";

/** Picture, source and title: known from the result card, so shown while the read is still going. */
export default function DiscoveryDetailHeader({
  title,
  imageUrl,
  sourceType,
  siteName,
  url,
}: {
  title: string;
  imageUrl: string | null;
  sourceType: DiscoverySourceType;
  siteName: string | null;
  url: string;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <DiscoveryThumbnail aspectRatio={DISCOVERY_DETAIL_IMAGE_ASPECT} isRounded path={imageUrl} />
      <View style={{ gap: spacing.sm }}>
        <DiscoverySourceLine publisher={siteName ?? hostLabel(url)} sourceType={sourceType} />
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
          {title}
        </Text>
      </View>
    </View>
  );
}
