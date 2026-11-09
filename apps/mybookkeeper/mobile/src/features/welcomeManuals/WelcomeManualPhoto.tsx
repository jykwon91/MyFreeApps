import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import { useTheme } from "@platform/mobile";
import { Image, Text, View } from "react-native";
import { WELCOME_MANUAL_PHOTO_FULL_HEIGHT as FULL_HEIGHT, WELCOME_MANUAL_PHOTO_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";

interface WelcomeManualPhotoProps {
  image: WelcomeManualSectionImageResponse;
  size: number | "full";
}

/** A section photo, or a line saying it's missing from storage. */
export default function WelcomeManualPhoto({ image, size }: WelcomeManualPhotoProps) {
  const { colors, radius, fontSize } = useTheme();
  const box = size === "full" ? { width: "100%" as const, height: FULL_HEIGHT } : { width: size, height: size };
  if (!image.presigned_url || image.is_available === false) {
    return (
      <View accessibilityLabel={MESSAGES.unavailable} accessible style={{ ...box, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.muted }}>
        {size === "full" ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.unavailable}</Text> : null}
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={image.caption ?? MESSAGES.view}
      resizeMode={size === "full" ? "contain" : "cover"}
      source={{ uri: image.presigned_url }}
      style={{ ...box, borderRadius: radius.md, backgroundColor: colors.muted }}
    />
  );
}
