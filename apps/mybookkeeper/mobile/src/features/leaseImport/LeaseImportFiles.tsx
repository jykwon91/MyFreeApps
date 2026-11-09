import { LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LEASE_IMPORT_MESSAGES as MESSAGES, removeFileLabel } from "../../constants/leaseImport";
import type { FileForUpload } from "../../types/FileForUpload";

interface LeaseImportFilesProps {
  files: readonly FileForUpload[];
  isDisabled: boolean;
  onRemove: (uri: string) => void;
}

/** What's been added so far. The first is the signed lease itself. */
export default function LeaseImportFiles({ files, isDisabled, onRemove }: LeaseImportFilesProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (files.length === 0) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noFiles}</Text>;
  return (
    <View style={{ gap: spacing.sm }}>
      {files.map((file, index) => (
        <View key={file.uri} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.name}</Text>
            {index === 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.signedLeaseTag}</Text> : null}
          </View>
          <LoadingButton accessibilityLabel={removeFileLabel(file.name)} disabled={isDisabled} onPress={() => onRemove(file.uri)} variant="ghost">
            {MESSAGES.removeFile}
          </LoadingButton>
        </View>
      ))}
    </View>
  );
}
