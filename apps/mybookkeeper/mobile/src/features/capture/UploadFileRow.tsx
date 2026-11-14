import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UPLOAD_PROGRESS_BAR_HEIGHT, uploadFileAccessibilityLabel, uploadFileStatusLabel } from "../../constants/capture";
import type { UploadFileProgress } from "../../types/UploadFileProgress";

/** One file's name and where it has got to, with a bar while it's going out. */
export default function UploadFileRow({ file }: { file: UploadFileProgress }) {
  const { colors, spacing, fontSize } = useTheme();
  const statusColor = file.status === "failed" ? colors.destructiveText : colors.mutedForeground;
  return (
    <View accessibilityLabel={uploadFileAccessibilityLabel(file)} accessible style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.foreground }}>
          {file.name}
        </Text>
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
  );
}
