import { type FileForUpload, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { chooseHeldFile, chooseHeldPhoto, takeHeldPhoto } from "./pickHeldFile";
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
}

export default function HeldFileButtons({ file, isPicking, isDisabled, fileTypes, photoName, takePhotoLabel, onPick }: HeldFileButtonsProps) {
  const { colors, fontSize } = useTheme();
  const [source, setSource] = useState<PickSource | null>(null);

  function buttonProps(name: PickSource, from: HeldFilePick) {
    return {
      disabled: isDisabled || isPicking,
      isLoading: isPicking && source === name,
      onPress: () => {
        setSource(name);
        onPick(from);
      },
      variant: "secondary" as const,
    };
  }

  return (
    <>
      {file ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.name}</Text> : null}
      <LoadingButton {...buttonProps("file", () => chooseHeldFile(fileTypes))}>
        {file ? UPLOAD_MESSAGES.chooseDifferentFile : UPLOAD_MESSAGES.chooseFile}
      </LoadingButton>
      <LoadingButton {...buttonProps("camera", () => takeHeldPhoto(photoName))}>{takePhotoLabel}</LoadingButton>
      <LoadingButton {...buttonProps("library", () => chooseHeldPhoto(photoName))}>{UPLOAD_MESSAGES.photoLibrary}</LoadingButton>
    </>
  );
}
