import { buildApplyUrl } from "@mybookkeeper/api-client/utils/applyUrl";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { WEB_BASE_URL } from "../../constants/api";
import { APPLY_QR_BACKGROUND, APPLY_QR_FOREGROUND, APPLY_QR_PADDING, APPLY_QR_SIZE, applyQrLabel, LISTING_MESSAGES } from "../../constants/listings";

interface ListingApplyQrProps {
  slug: string;
  title: string;
}

/** The apply link as a QR code, collapsed until asked for, like the website. */
export default function ListingApplyQr({ slug, title }: ListingApplyQrProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isShown, setIsShown] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton onPress={() => setIsShown((shown) => !shown)} variant="secondary">
        {isShown ? LISTING_MESSAGES.hideQr : LISTING_MESSAGES.showQr}
      </LoadingButton>
      {isShown ? (
        <View style={{ gap: spacing.xs, alignItems: "center" }}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={applyQrLabel(title)}
            style={{ backgroundColor: APPLY_QR_BACKGROUND, padding: APPLY_QR_PADDING, borderRadius: spacing.sm }}
          >
            <QRCode value={buildApplyUrl(WEB_BASE_URL, slug)} size={APPLY_QR_SIZE} backgroundColor={APPLY_QR_BACKGROUND} color={APPLY_QR_FOREGROUND} />
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" }}>{LISTING_MESSAGES.qrNote}</Text>
        </View>
      ) : null}
    </View>
  );
}
