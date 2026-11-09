import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { Image, Text, View } from "react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../../constants/listingPhotos";
import type { ListingPhotoUpload } from "../../types/ListingPhotoUpload";

interface ListingPhotoUploadRowProps {
  upload: ListingPhotoUpload;
  onRetry: () => void;
  onDiscard: () => void;
}

/** A photo that's waiting, on its way, or didn't make it, with what to do about it. */
export default function ListingPhotoUploadRow({ upload, onRetry, onDiscard }: ListingPhotoUploadRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const status = upload.status === "failed" ? null : upload.status === "sending" ? MESSAGES.sending : MESSAGES.waiting;
  return (
    <View style={{ gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, borderColor: colors.input }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Image accessibilityIgnoresInvertColors source={{ uri: upload.file.uri }} style={{ width: 56, height: 56, borderRadius: radius.sm }} />
        {status ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{status}</Text> : null}
      </View>
      {upload.status === "failed" ? (
        <>
          {upload.problem ? <Banner message={upload.problem} /> : null}
          <LoadingButton onPress={onRetry}>{MESSAGES.retry}</LoadingButton>
          <LoadingButton onPress={onDiscard} variant="secondary">
            {MESSAGES.discardUpload}
          </LoadingButton>
        </>
      ) : null}
    </View>
  );
}
