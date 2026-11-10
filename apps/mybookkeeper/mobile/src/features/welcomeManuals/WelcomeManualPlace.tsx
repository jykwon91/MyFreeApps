import type { WelcomeManualPlaceResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-response";
import { LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { placeLine, placeMapLabel } from "./welcomeManualDisplay";

export default function WelcomeManualPlace({ place }: { place: WelcomeManualPlaceResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const mapUrl = place.map_url;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{place.name}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{placeLine(place)}</Text>
      {place.note ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{place.note}</Text> : null}
      {mapUrl ? (
        <LoadingButton accessibilityLabel={placeMapLabel(place.name)} onPress={() => void openLink(mapUrl)} variant="ghost">
          {WELCOME_MANUAL_MESSAGES.openMap}
        </LoadingButton>
      ) : null}
    </View>
  );
}
