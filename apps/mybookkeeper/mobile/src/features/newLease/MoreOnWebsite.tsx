import { LINK_MESSAGES, LoadingButton, useOpenWebsite, useTheme, type WebPath } from "@platform/mobile";
import { Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";

/** A list capped at one page: the rest are on the website. */
export default function MoreOnWebsite({ path }: { path: WebPath }) {
  const { colors, spacing, fontSize } = useTheme();
  const openWebsite = useOpenWebsite();
  return (
    <View style={{ gap: spacing.sm, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.moreThanShown}</Text>
      <LoadingButton accessibilityHint={LINK_MESSAGES.opensBrowser} onPress={() => openWebsite(WEB_BASE_URL, path)} variant="ghost">
        {MESSAGES.seeAllOnWebsite}
      </LoadingButton>
    </View>
  );
}
