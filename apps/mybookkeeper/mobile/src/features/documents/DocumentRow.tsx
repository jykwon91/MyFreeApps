import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { timeAgo } from "../../utils/timeAgo";
import { documentName, documentStatusLabel, documentStatusLine, documentTypeLabel } from "./documentDisplay";
import DocumentStatusChip from "./DocumentStatusChip";

export default function DocumentRow({ document, onPress }: { document: Document; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const name = documentName(document);
  const type = documentTypeLabel(document);
  const when = timeAgo(document.created_at);
  const statusLine = documentStatusLine(document);
  const details = [type, document.source === "email" ? "Email" : null, when].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityLabel={`${name}, ${type}, ${documentStatusLabel(document)}, ${when}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text
          ellipsizeMode="middle"
          numberOfLines={1}
          style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}
        >
          {name}
        </Text>
        <DocumentStatusChip document={document} />
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{details}</Text>
      {statusLine ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{statusLine}</Text> : null}
      {document.status === "failed" && document.error_message ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{document.error_message}</Text>
      ) : null}
    </Pressable>
  );
}
