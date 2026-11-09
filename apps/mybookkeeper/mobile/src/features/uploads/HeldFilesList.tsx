import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { removeHeldFileLabel, UPLOAD_MESSAGES } from "../../constants/uploads";
import type { FileForUpload } from "../../types/FileForUpload";

interface HeldFilesListProps {
  files: readonly FileForUpload[];
  isDisabled: boolean;
  onRemove: (uri: string) => void;
  /** Shown when nothing has been added yet. */
  emptyText: string;
  /** A line under the first file's name, for a list where the first one means something. */
  firstFileNote?: string;
}

/** The files a sheet or form is about to send, each with a way to take it back out. */
export default function HeldFilesList({ files, isDisabled, onRemove, emptyText, firstFileNote }: HeldFilesListProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (files.length === 0) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{emptyText}</Text>;
  return (
    <View style={{ gap: spacing.sm }}>
      {files.map((file, index) => (
        <View key={file.uri} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontSize: fontSize.md, color: colors.foreground }}>
              {file.name}
            </Text>
            {index === 0 && firstFileNote ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{firstFileNote}</Text> : null}
          </View>
          <LoadingButton accessibilityLabel={removeHeldFileLabel(file.name)} disabled={isDisabled} onPress={() => onRemove(file.uri)} variant="ghost">
            {UPLOAD_MESSAGES.removeFile}
          </LoadingButton>
        </View>
      ))}
    </View>
  );
}
