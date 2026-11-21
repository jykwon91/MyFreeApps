import { Thumbnail } from "@platform/mobile";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { photoViewerPageLabel, WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES as MESSAGES, WELCOME_MANUAL_PHOTO_VIEWER_STYLE as STYLE } from "../../constants/welcomeManualPhotoViewer";
import type { WelcomeManualPhotoViewerPageProps } from "../../types/WelcomeManualPhotoViewerPageProps";

/** One full-screen page of the viewer: the photo, or a line saying it's missing, and its caption. */
export default function WelcomeManualPhotoViewerPage({ image, index, total, width, onRetry }: WelcomeManualPhotoViewerPageProps) {
  const { height } = useWindowDimensions();
  const isAvailable = Boolean(image.presigned_url) && image.is_available !== false;
  const [hasFailed, setHasFailed] = useState(false);
  const label = photoViewerPageLabel(index, total, image.caption, hasFailed);
  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {isAvailable ? (
        <Thumbnail accessibilityIgnoresInvertColors failedMessage={MESSAGES.couldntLoad} failedColors={{ text: STYLE.mutedOnBackdrop, background: STYLE.backdrop }} onFailedChange={setHasFailed} onRetry={onRetry} resizeMode="contain" source={{ uri: image.presigned_url ?? undefined }} testID="welcome-manual-photo-image" style={{ width, height: height * 0.7 }} />
      ) : (
        <Text style={{ textAlign: "center", color: STYLE.mutedOnBackdrop }}>{MESSAGES.unavailable}</Text>
      )}
      {/* Only this block is labelled: the failed photo's "Try again" button stays its own stop. */}
      <View accessible accessibilityLabel={label}>
        <Text style={{ padding: 16, textAlign: "center", color: image.caption ? STYLE.onBackdrop : STYLE.mutedOnBackdrop }}>{image.caption ?? MESSAGES.noCaption}</Text>
      </View>
    </View>
  );
}
