import { Banner, LoadingButton, Thumbnail, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES, removeUploadLabel, retryUploadLabel, uploadStateLabel } from "../../constants/listingPhotos";
import type { ListingPhotoUpload } from "../../types/ListingPhotoUpload";

interface ListingPhotoUploadRowProps {
  upload: ListingPhotoUpload;
  /** Where this photo is among those still to go, counting from 1, so its buttons can say which one. */
  position: number;
  onRetry: () => void;
  onDiscard: () => void;
}

/**
 * A photo that's waiting, on its way, or didn't make it, with what to do about it. Its status isn't read
 * out: the batch's progress line above the rows already is, and a row each would queue one line per photo.
 * The Banner reads its own problem.
 */
export default function ListingPhotoUploadRow({ upload, position, onRetry, onDiscard }: ListingPhotoUploadRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const status = upload.status === "failed" ? null : upload.status === "sending" ? MESSAGES.sending : MESSAGES.waiting;
  return (
    <View style={{ gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, borderColor: colors.input }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Thumbnail accessibilityIgnoresInvertColors accessibilityLabel={uploadStateLabel(position, status ?? MESSAGES.failed)} source={{ uri: upload.file.uri }} style={{ width: 56, height: 56, borderRadius: radius.sm }} />
        {status ? (
          <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{status}</Text>
        ) : null}
      </View>
      {upload.status === "failed" ? (
        <>
          {upload.problem ? <Banner message={upload.problem} /> : null}
          <LoadingButton accessibilityLabel={retryUploadLabel(position)} onPress={onRetry}>
            {MESSAGES.retry}
          </LoadingButton>
          <LoadingButton accessibilityLabel={removeUploadLabel(position)} onPress={onDiscard} variant="secondary">
            {MESSAGES.discardUpload}
          </LoadingButton>
        </>
      ) : null}
    </View>
  );
}
