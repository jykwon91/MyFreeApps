import { type FileForUpload, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { chooseHeldFile, chooseHeldPhoto, takeHeldPhoto } from "./pickHeldFile";
import type { HeldPhotoSource } from "../../types/HeldPhotoSource";
import type { HeldFilePick } from "./useHeldFiles";

type PickSource = "file" | "camera" | "library";

interface HeldFileButtonsProps {
  file: FileForUpload | null;
  isPicking: boolean;
  isDisabled: boolean;
  fileTypes: readonly string[];
  photoName: string;
  takePhotoLabel: string;
  onPick: (from: HeldFilePick) => void;
  /** Takes over the camera and library buttons, for a sheet that keeps several photos from one pick. */
  onPickPhoto?: (source: HeldPhotoSource) => void;
}

export default function HeldFileButtons({ file, isPicking, isDisabled, fileTypes, photoName, takePhotoLabel, onPick, onPickPhoto }: HeldFileButtonsProps) {
  const { colors, fontSize } = useTheme();
  const [source, setSource] = useState<PickSource | null>(null);

  function buttonProps(name: PickSource, run: () => void) {
    return {
      disabled: isDisabled || isPicking,
      isLoading: isPicking && source === name,
      onPress: () => {
        setSource(name);
        run();
      },
      variant: "secondary" as const,
    };
  }

  return (
    <>
      {file ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.name}</Text> : null}
      <LoadingButton {...buttonProps("file", () => onPick(() => chooseHeldFile(fileTypes)))}>
        {file ? UPLOAD_MESSAGES.chooseDifferentFile : UPLOAD_MESSAGES.chooseFile}
      </LoadingButton>
      <LoadingButton {...buttonProps("camera", () => (onPickPhoto ? onPickPhoto("camera") : onPick(() => takeHeldPhoto(photoName))))}>{takePhotoLabel}</LoadingButton>
      <LoadingButton {...buttonProps("library", () => (onPickPhoto ? onPickPhoto("library") : onPick(() => chooseHeldPhoto(photoName))))}>{UPLOAD_MESSAGES.photoLibrary}</LoadingButton>
    </>
  );
}
