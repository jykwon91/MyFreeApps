import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { documentStatusLabel } from "./documentDisplay";

export default function DocumentStatusChip({ document }: { document: Document }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isFailed = document.status === "failed";
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: isFailed ? colors.destructive : colors.muted,
      }}
    >
      <Text style={{ fontSize: fontSize.sm, color: isFailed ? colors.destructiveForeground : colors.mutedForeground }}>
        {documentStatusLabel(document)}
      </Text>
    </View>
  );
}
