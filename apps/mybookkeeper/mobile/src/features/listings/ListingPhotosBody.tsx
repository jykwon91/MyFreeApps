import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { moveId, sortPhotos } from "@mybookkeeper/api-client/utils/listingPhotoOrder";
import { Banner, EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES, preparingProgress, removeManyBody, removeManyTitle, selectedCount, uploadProgress } from "../../constants/listingPhotos";
import { askOnce } from "../../lib/askOnce";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingPhotoAddSheet from "./ListingPhotoAddSheet";
import ListingPhotoGrid from "./ListingPhotoGrid";
import ListingPhotoUploadRow from "./ListingPhotoUploadRow";
import ListingPhotoViewer from "./ListingPhotoViewer";
import { useListingPhotoActions } from "./useListingPhotoActions";
import { useListingPhotoAdding } from "./useListingPhotoAdding";

export default function ListingPhotosBody({ listing }: { listing: ListingResponse }) {
  const { spacing, colors, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const asking = useRef(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  // The photo that's open is tracked by id, so a reorder or a refetch can't leave the viewer on a different one.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const photos = sortPhotos(listing.photos);
  const actions = useListingPhotoActions(listing);
  const { uploads, picker, isAdding } = useListingPhotoAdding(listing.id);
  const viewingIndex = viewingId === null ? -1 : photos.findIndex((photo) => photo.id === viewingId);
  const isViewing = viewingIndex >= 0;

  // The photo is gone (removed here or on another device): close the viewer rather than point at a stranger.
  if (viewingId !== null && viewingIndex < 0) setViewingId(null);

  useConfirmLeave(isAdding, (leave) => {
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.stay, style: "cancel" },
      { text: MESSAGES.leave, style: "destructive", onPress: leave },
    ]);
  });

  function toggle(photoId: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(photoId)) next.add(photoId);
      return next;
    });
  }

  function stopSelecting(): void {
    setIsSelecting(false);
    setSelected(new Set());
  }

  async function removeSelected(): Promise<void> {
    const ids = photos.filter((photo) => selected.has(photo.id)).map((photo) => photo.id);
    const stillThere = await actions.remove(ids);
    if (stillThere === null) return;
    if (stillThere.length === 0) stopSelecting();
    else setSelected(new Set(stillThere));
  }

  async function move(photo: ListingPhoto, to: number): Promise<void> {
    await actions.reorder(moveId(photos.map((p) => p.id), photos.indexOf(photo), to));
  }

  async function removeOne(photo: ListingPhoto): Promise<void> {
    const stillThere = await actions.remove([photo.id]);
    if (stillThere?.length === 0) setViewingId(null);
  }

  const isEmpty = photos.length === 0 && uploads.items.length === 0 && !picker.preparing;
  const busy = actions.isRemoving || actions.isReordering || actions.isRefreshing;
  const problem = picker.problem ?? (isViewing ? null : actions.failure);
  const addSheet = (
    <ListingPhotoAddSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSelect={(source) => { setIsAddOpen(false); void picker.add(source); }} />
  );

  if (isEmpty) {
    return (
      <>
        {problem ? (
          <View style={{ padding: spacing.lg }}>
            <Banner message={problem} />
          </View>
        ) : null}
        <EmptyState
          action={canWrite ? { label: MESSAGES.add, onPress: () => setIsAddOpen(true) } : undefined}
          body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
          heading={MESSAGES.noneHeading}
        />
        {addSheet}
      </>
    );
  }

  const header = (
    <>
      {problem ? <Banner message={problem} /> : null}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isSelecting} onPress={() => setIsAddOpen(true)}>
            {MESSAGES.add}
          </LoadingButton>
          {photos.length > 0 ? (
            <LoadingButton onPress={isSelecting ? stopSelecting : () => setIsSelecting(true)} variant="secondary">
              {isSelecting ? MESSAGES.cancelSelect : MESSAGES.select}
            </LoadingButton>
          ) : null}
        </View>
      ) : null}
      {picker.preparing ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
          {preparingProgress(picker.preparing.done, picker.preparing.total)}
        </Text>
      ) : null}
      {uploads.isSending ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
          {uploadProgress(uploads.batch.done, uploads.batch.total)}
        </Text>
      ) : null}
      {uploads.items.map((upload, i) => (
        <ListingPhotoUploadRow key={upload.key} onDiscard={() => uploads.discard(upload.key)} onRetry={() => uploads.retry(upload.key)} position={i + 1} upload={upload} />
      ))}
      {isSelecting ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
            {selected.size === 0 ? MESSAGES.noneSelected : selectedCount(selected.size)}
          </Text>
          <LoadingButton
            disabled={selected.size === 0 || busy}
            isLoading={actions.isRemoving}
            loadingText={MESSAGES.removing}
            onPress={() => askOnce(asking, removeManyTitle(selected.size), removeManyBody(selected.size), { text: MESSAGES.remove, style: "destructive", onPress: () => void removeSelected() })}
            variant="destructive"
          >
            {MESSAGES.removeSelected}
          </LoadingButton>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <ListingPhotoGrid
        header={header}
        isSelecting={isSelecting}
        onPress={(photo) => (isSelecting ? toggle(photo.id) : setViewingId(photo.id))}
        photos={photos}
        selected={selected}
      />
      <ListingPhotoViewer
        canWrite={canWrite}
        failure={actions.failure}
        index={isViewing ? viewingIndex : null}
        isBusy={busy}
        onClose={() => setViewingId(null)}
        onIndexChange={(i) => setViewingId(photos[i]?.id ?? null)}
        onMove={(from, to) => void move(photos[from], to)}
        onRemove={(photo) => void removeOne(photo)}
        photos={photos}
      />
      {addSheet}
    </>
  );
}
