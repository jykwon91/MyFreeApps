import { discardFile, LoadingButton, Toast, useTheme } from "@platform/mobile";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { MAX_FILES_AT_ONCE, SHUTTER_SIZE } from "../../constants/capture";
import type { AppDispatch, RootState } from "../../lib/store";
import type { PickedPhoto } from "../../types/PickedPhoto";
import CameraPermissionPrompt from "./CameraPermissionPrompt";
import { drainUploadQueue } from "./drainUploadQueue";
import PhotoReview from "./PhotoReview";
import { pickPdfs, pickPhotos } from "./pickFiles";
import { preparePhoto } from "./preparePhoto";
import { pdfFileName, photoName } from "./uploadFileNames";
import { addToQueue } from "./uploadQueueFiles";
import UploadStatus from "./UploadStatus";

export default function CaptureScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const workspaceId = useSelector((state: RootState) => state.workspace.activeId);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [isTaking, setIsTaking] = useState(false);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  function requireWorkspace(): string {
    if (!workspaceId) throw new Error("No workspace to add to");
    return workspaceId;
  }

  async function addPhotos(photos: PickedPhoto[]): Promise<void> {
    const workspace = requireWorkspace();
    try {
      for (const picked of photos) {
        addToQueue(workspace, await preparePhoto(picked.uri), photoName());
        discardFile(picked.uri);
        setAddedCount((count) => count + 1);
      }
    } finally {
      void dispatch(drainUploadQueue());
    }
  }

  async function takePhoto(): Promise<void> {
    setIsTaking(true);
    try {
      const taken = await camera.current?.takePictureAsync({ exif: false });
      if (taken) setPhoto(taken);
    } catch {
      setMessage("I couldn't take that photo. Want to try again?");
    } finally {
      setIsTaking(false);
    }
  }

  async function acceptPhoto(): Promise<void> {
    if (!photo) return;
    try {
      await addPhotos([photo]);
      setPhoto(null);
    } catch {
      setMessage("I couldn't save that photo. Want to try again?");
    }
  }

  function retake(): void {
    if (photo) discardFile(photo.uri);
    setPhoto(null);
  }

  async function chooseFromLibrary(): Promise<void> {
    try {
      await addPhotos(await pickPhotos());
    } catch {
      setMessage("I couldn't use those photos. Want to try again?");
    }
  }

  async function chooseFiles(): Promise<void> {
    try {
      const workspace = requireWorkspace();
      for (const pdf of await pickPdfs()) {
        addToQueue(workspace, pdf.uri, pdfFileName(pdf.name));
        setAddedCount((count) => count + 1);
      }
      void dispatch(drainUploadQueue());
    } catch {
      setMessage("I couldn't use that file. Want to try again?");
    }
  }

  const footerButtons = (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <LoadingButton onPress={chooseFromLibrary} variant="secondary">
          Library
        </LoadingButton>
      </View>
      <View style={{ flex: 1 }}>
        <LoadingButton onPress={chooseFiles} variant="secondary">
          Files
        </LoadingButton>
      </View>
      <View style={{ flex: 1 }}>
        <LoadingButton onPress={() => router.dismissTo("/money")}>
          {addedCount > 0 ? `Done (${addedCount})` : "Done"}
        </LoadingButton>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {photo ? (
        <PhotoReview onRetake={retake} onUse={acceptPhoto} uri={photo.uri} />
      ) : (
        <View style={{ flex: 1 }}>
          {permission?.granted ? (
            <CameraView facing="back" ref={camera} style={{ flex: 1 }}>
              <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", padding: spacing.lg }}>
                <Pressable
                  accessibilityLabel="Take photo"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isTaking, busy: isTaking }}
                  disabled={isTaking}
                  onPress={takePhoto}
                  style={{
                    width: SHUTTER_SIZE,
                    height: SHUTTER_SIZE,
                    borderRadius: SHUTTER_SIZE / 2,
                    borderWidth: 4,
                    borderColor: colors.card,
                    opacity: isTaking ? 0.5 : 1,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            </CameraView>
          ) : permission ? (
            <CameraPermissionPrompt canAsk={permission.canAskAgain} onAsk={requestPermission} />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={{ gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl }}>
            <UploadStatus />
            {footerButtons}
            <Text style={{ textAlign: "center", fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {`Photos, or a PDF from Files. Up to ${MAX_FILES_AT_ONCE} at a time.`}
            </Text>
          </View>
        </View>
      )}
      {message ? <Toast message={message} onDismiss={() => setMessage(null)} style={{ margin: spacing.lg }} variant="error" /> : null}
    </View>
  );
}
