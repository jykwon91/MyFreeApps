import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Share, Text, View } from "react-native";
import { LISTING_MESSAGES } from "../../constants/listings";
import { inquiryFormLink } from "./listingDisplay";

interface ListingShareLinkProps {
  slug: string;
}

export default function ListingShareLink({ slug }: ListingShareLinkProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const link = inquiryFormLink(slug);

  async function share(): Promise<void> {
    try {
      await Share.share({ message: link });
    } catch {
      showToast(LISTING_MESSAGES.shareFailed, "error");
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <LoadingButton onPress={() => void share()} variant="secondary">
        {LISTING_MESSAGES.shareLink}
      </LoadingButton>
      <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {link}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LISTING_MESSAGES.shareLinkNote}</Text>
    </View>
  );
}
