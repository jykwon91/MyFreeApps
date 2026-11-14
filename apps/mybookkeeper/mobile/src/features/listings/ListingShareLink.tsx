import { buildApplyUrl } from "@mybookkeeper/api-client/utils/applyUrl";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Share, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { LISTING_MESSAGES } from "../../constants/listings";
import { useCopyText } from "../../lib/useCopyText";

interface ListingShareLinkProps {
  slug: string;
}

export default function ListingShareLink({ slug }: ListingShareLinkProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const copyText = useCopyText();
  const link = buildApplyUrl(WEB_BASE_URL, slug);

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
      <LoadingButton onPress={() => void copyText(link, LISTING_MESSAGES.linkCopied, LISTING_MESSAGES.copyFailed)} variant="secondary">
        {LISTING_MESSAGES.copyLink}
      </LoadingButton>
      <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {link}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LISTING_MESSAGES.shareLinkNote}</Text>
    </View>
  );
}
