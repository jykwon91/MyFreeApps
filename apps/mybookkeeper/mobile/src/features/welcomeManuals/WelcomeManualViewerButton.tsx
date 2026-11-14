import { Pressable, Text } from "react-native";
import { WELCOME_MANUAL_PHOTO_VIEWER_STYLE as STYLE } from "../../constants/welcomeManualPhotoViewer";
import type { WelcomeManualViewerButtonProps } from "../../types/WelcomeManualViewerButtonProps";

/** A round 44pt button over the photo. */
export default function WelcomeManualViewerButton({ glyph, label, onPress }: WelcomeManualViewerButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minWidth: STYLE.touchTarget, height: STYLE.touchTarget, paddingHorizontal: 12, borderRadius: STYLE.touchTarget / 2, alignItems: "center", justifyContent: "center", backgroundColor: STYLE.overlay }}
    >
      <Text importantForAccessibility="no" style={{ fontSize: STYLE.glyphSize, color: STYLE.onBackdrop }}>
        {glyph}
      </Text>
    </Pressable>
  );
}
