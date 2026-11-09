import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";
import { FormSheet, LoadingButton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { WELCOME_MANUAL_PHOTO_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import WelcomeManualPhoto from "./WelcomeManualPhoto";

/** What someone with view-only access sees of a photo: the picture and its caption. */
export default function WelcomeManualPhotoViewer({ image, onClose }: { image: WelcomeManualSectionImageResponse; onClose: () => void }) {
  const { colors, fontSize } = useTheme();
  return (
    <FormSheet isOpen onRequestClose={onClose} title={MESSAGES.view}>
      <WelcomeManualPhoto image={image} size="full" />
      <Text style={{ fontSize: fontSize.md, color: image.caption ? colors.foreground : colors.mutedForeground }}>{image.caption ?? MESSAGES.noCaption}</Text>
      <LoadingButton onPress={onClose} variant="secondary">
        {MESSAGES.close}
      </LoadingButton>
    </FormSheet>
  );
}
