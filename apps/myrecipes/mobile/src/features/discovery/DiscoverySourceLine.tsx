import { DISCOVERY_SOURCE_LABELS } from "@myrecipes/api-client/constants/discovery";
import type { DiscoverySourceType } from "@myrecipes/api-client/types/recipe/discovery";
import { Chip, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DISCOVERY_SOURCE_TONES } from "../../constants/discovery";

/** The kind of source, so the mix is visible at a glance, and who published it. */
export default function DiscoverySourceLine({ sourceType, publisher }: { sourceType: DiscoverySourceType; publisher: string }) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }}>
      <Chip label={DISCOVERY_SOURCE_LABELS[sourceType]} tone={DISCOVERY_SOURCE_TONES[sourceType]} />
      {publisher ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.mutedForeground, fontSize: fontSize.xs }}>
          {publisher}
        </Text>
      ) : null}
    </View>
  );
}
