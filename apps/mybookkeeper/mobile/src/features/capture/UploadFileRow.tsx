import { ClampedText, LARGE_TEXT_FILE_NAME_LINES, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UPLOAD_PROGRESS_BAR_HEIGHT, uploadFileAccessibilityLabel, uploadFileStatusLabel } from "../../constants/capture";
import type { UploadFileProgress } from "../../types/UploadFileProgress";
import UploadBatchControls from "./UploadBatchControls";

/** One file's name and where it has got to, with a bar while it's going out, and a way to stop a zip being read. */
export default function UploadFileRow({ file }: { file: UploadFileProgress }) {
  const { colors, spacing, fontSize } = useTheme();
  const statusColor = file.status === "failed" ? colors.destructiveText : colors.mutedForeground;
  return (
    <View style={{ gap: spacing.xs }}>
      <View accessibilityLabel={uploadFileAccessibilityLabel(file)} accessible style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ClampedText largeTextNumberOfLines={LARGE_TEXT_FILE_NAME_LINES} numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.foreground }}>
            {file.name}
          </ClampedText>
          <Text style={{ fontSize: fontSize.sm, color: statusColor }}>{uploadFileStatusLabel(file)}</Text>
        </View>
        {file.status === "uploading" ? (
          <View
            style={{
              height: UPLOAD_PROGRESS_BAR_HEIGHT,
              borderRadius: UPLOAD_PROGRESS_BAR_HEIGHT / 2,
              backgroundColor: colors.muted,
              overflow: "hidden",
            }}
          >
            <View style={{ height: UPLOAD_PROGRESS_BAR_HEIGHT, width: `${file.percent ?? 0}%`, backgroundColor: colors.primary }} />
          </View>
        ) : null}
      </View>
      {file.status === "reading" && file.batchId ? (
        <UploadBatchControls batchId={file.batchId} name={file.name} uri={file.uri} />
      ) : null}
    </View>
  );
}
