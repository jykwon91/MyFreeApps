import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { moveId, sortPhotos } from "@mybookkeeper/api-client/utils/listingPhotoOrder";
import { Banner, EmptyState, LoadingButton, OptionSheet, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES, removeManyBody, removeManyTitle, selectedCount, uploadProgress } from "../../constants/listingPhotos";
import { askOnce } from "../../lib/askOnce";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import { useCanWrite } from "../workspace/useCanWrite";
import ListingPhotoGrid from "./ListingPhotoGrid";
import ListingPhotoUploadRow from "./ListingPhotoUploadRow";
import ListingPhotoViewer from "./ListingPhotoViewer";
import { pickLibraryPhotos, takeListingPhoto } from "./pickListingPhotos";
import { useListingPhotoActions } from "./useListingPhotoActions";
import { useListingPhotoUploads } from "./useListingPhotoUploads";

type AddSource = "camera" | "library";
const ADD_OPTIONS: { value: AddSource; label: string }[] = [
  { value: "camera", label: MESSAGES.takePhoto },
  { value: "library", label: MESSAGES.fromLibrary },
];

export default function ListingPhotosBody({ listing }: { listing: ListingResponse }) {
  const { spacing, colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const asking = useRef(false);
  const isPicking = useRef(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const photos = sortPhotos(listing.photos);
  const actions = useListingPhotoActions(listing);
  const uploads = useListingPhotoUploads(listing.id, (count) => showToast(count === 1 ? MESSAGES.uploadedOne : MESSAGES.uploadedMany));

  useConfirmLeave(uploads.items.length > 0, (leave) => {
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.stay, style: "cancel" },
      { text: MESSAGES.leave, style: "destructive", onPress: leave },
    ]);
  });

  async function add(source: AddSource): Promise<void> {
    if (isPicking.current) return;
    isPicking.current = true;
    setPickProblem(null);
    try {
      if (source === "camera") {
        const photo = await takeListingPhoto();
        if (photo === "denied") setPickProblem(MESSAGES.cameraDenied);
        else if (photo) uploads.add([photo]);
        return;
      }
      const picked = await pickLibraryPhotos();
      if (picked.unreadable > 0) setPickProblem(MESSAGES.pickFailed);
      if (picked.files.length > 0) uploads.add(picked.files);
    } catch {
      setPickProblem(MESSAGES.pickFailed);
    } finally {
      isPicking.current = false;
    }
  }

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
    if (await actions.remove(ids)) stopSelecting();
    else setSelected((current) => new Set([...current].filter((id) => listing.photos.some((photo) => photo.id === id))));
  }

  async function move(from: number, to: number): Promise<void> {
    if (await actions.reorder(moveId(photos.map((photo) => photo.id), from, to))) setViewing(to);
  }

  async function removeOne(photo: ListingPhoto): Promise<void> {
    if (await actions.remove([photo.id])) setViewing(null);
  }

  const isEmpty = photos.length === 0 && uploads.items.length === 0;
  const busy = actions.isRemoving || actions.isReordering;
  const problem = pickProblem ?? (viewing === null ? actions.failure : null);

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
        <OptionSheet<AddSource> isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSelect={(source) => { setIsAddOpen(false); void add(source); }} options={ADD_OPTIONS} title={MESSAGES.addTitle} value="library" />
      </>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
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
        {uploads.isSending ? (
          <Text accessibilityRole="progressbar" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
            {uploadProgress(uploads.batch.done, uploads.batch.total)}
          </Text>
        ) : null}
        {uploads.items.map((upload) => (
          <ListingPhotoUploadRow key={upload.key} onDiscard={() => uploads.discard(upload.key)} onRetry={() => uploads.retry(upload.key)} upload={upload} />
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
        <ListingPhotoGrid isSelecting={isSelecting} onPress={(photo, index) => (isSelecting ? toggle(photo.id) : setViewing(index))} photos={photos} selected={selected} />
      </ScrollView>
      <ListingPhotoViewer
        canWrite={canWrite}
        failure={actions.failure}
        index={viewing}
        isBusy={busy}
        onClose={() => setViewing(null)}
        onIndexChange={setViewing}
        onMove={(from, to) => void move(from, to)}
        onRemove={(photo) => void removeOne(photo)}
        photos={photos}
      />
      <OptionSheet<AddSource> isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSelect={(source) => { setIsAddOpen(false); void add(source); }} options={ADD_OPTIONS} title={MESSAGES.addTitle} value="library" />
    </>
  );
}
