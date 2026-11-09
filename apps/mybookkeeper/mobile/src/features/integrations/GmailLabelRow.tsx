import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { useCanWrite } from "../workspace/useCanWrite";
import GmailLabelSheet from "./GmailLabelSheet";

/** Which Gmail label syncing is limited to. A writer can change it. */
export default function GmailLabelRow({ label }: { label: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [isEditing, setIsEditing] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.labelHeading}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{label ? MESSAGES.labelCurrently(label) : MESSAGES.labelNone}</Text>
      {label ? null : <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.labelEmptyHint}</Text>}
      {canWrite ? (
        <LoadingButton onPress={() => setIsEditing(true)} variant="secondary">
          {MESSAGES.labelEdit}
        </LoadingButton>
      ) : null}
      {isEditing ? <GmailLabelSheet onClose={() => setIsEditing(false)} saved={label} /> : null}
    </View>
  );
}
