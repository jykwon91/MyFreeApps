import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import { Banner, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Image, Modal, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES, photoLabel, photoPosition } from "../../constants/listingPhotos";
import { askOnce } from "../../lib/askOnce";
import { mimeTypeFor } from "@platform/core/utils/mimeTypeFor";
import { openAttachmentFile } from "../documents/openDocumentFile";
import { photoUrl } from "./listingPhotoDisplay";

interface ListingPhotoViewerProps {
  photos: readonly ListingPhoto[];
  /** Which photo is open, or null when none is. */
  index: number | null;
  canWrite: boolean;
  isBusy: boolean;
  failure: string | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (photo: ListingPhoto) => void;
}

/** One photo, large, with a way to step through the rest and what can be done to it. */
export default function ListingPhotoViewer({ photos, index, canWrite, isBusy, failure, onIndexChange, onClose, onMove, onRemove }: ListingPhotoViewerProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const asking = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const photo = index === null ? undefined : photos[index];
  if (index === null || !photo) return null;
  const url = photoUrl(photo);

  async function share(current: ListingPhoto, address: string): Promise<void> {
    setIsSharing(true);
    try {
      await openAttachmentFile(address, { id: current.id, filename: current.storage_key, content_type: mimeTypeFor(current.storage_key) });
    } catch {
      showToast(MESSAGES.shareFailed, "error");
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {photoPosition(index, photos.length)}
        </Text>
        {failure ? <Banner message={failure} /> : null}
        {url ? (
          <Image accessibilityIgnoresInvertColors accessibilityLabel={photoLabel(index, photos.length, photo.caption, [])} resizeMode="contain" source={{ uri: url }} style={{ width: width - spacing.lg * 2, height: width }} />
        ) : (
          <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.unavailableDetail}</Text>
        )}
        {photo.caption ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{photo.caption}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <LoadingButton disabled={index === 0} onPress={() => onIndexChange(index - 1)} variant="secondary">
              {MESSAGES.previous}
            </LoadingButton>
          </View>
          <View style={{ flex: 1 }}>
            <LoadingButton disabled={index === photos.length - 1} onPress={() => onIndexChange(index + 1)} variant="secondary">
              {MESSAGES.next}
            </LoadingButton>
          </View>
        </View>
        {url ? (
          <LoadingButton isLoading={isSharing} onPress={() => void share(photo, url)} variant="secondary">
            {MESSAGES.shareOne}
          </LoadingButton>
        ) : null}
        {canWrite ? (
          <>
            {index > 0 ? (
              <LoadingButton disabled={isBusy} isLoading={isBusy} onPress={() => onMove(index, 0)} variant="secondary">
                {MESSAGES.makeCover}
              </LoadingButton>
            ) : null}
            {index > 0 ? (
              <LoadingButton disabled={isBusy} onPress={() => onMove(index, index - 1)} variant="secondary">
                {MESSAGES.earlier}
              </LoadingButton>
            ) : null}
            {index < photos.length - 1 ? (
              <LoadingButton disabled={isBusy} onPress={() => onMove(index, index + 1)} variant="secondary">
                {MESSAGES.later}
              </LoadingButton>
            ) : null}
            <LoadingButton
              disabled={isBusy}
              onPress={() => askOnce(asking, MESSAGES.removeOneTitle, MESSAGES.removeOneBody, { text: MESSAGES.remove, style: "destructive", onPress: () => onRemove(photo) })}
              variant="destructive"
            >
              {MESSAGES.remove}
            </LoadingButton>
          </>
        ) : null}
        <LoadingButton onPress={onClose}>{MESSAGES.close}</LoadingButton>
      </ScrollView>
    </Modal>
  );
}
