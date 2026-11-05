import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { useOpenLink } from "../inquiries/useOpenLink";

/** A list capped at one page: the rest are on the website. */
export default function MoreOnWebsite({ path }: { path: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  return (
    <View style={{ gap: spacing.sm, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.moreThanShown}</Text>
      <LoadingButton accessibilityHint="Opens your browser" onPress={() => void openLink(`${WEB_BASE_URL}${path}`)} variant="ghost">
        {MESSAGES.seeAllOnWebsite}
      </LoadingButton>
    </View>
  );
}
