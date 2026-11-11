import { LoadingButton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import type { CardActionsProps } from "../../types/CardActionsProps";

/** Edit and Remove along the bottom of a profile card. Edit waits while a removal is on its way. */
export default function CardActions({ subject, onEdit, onRemove, isRemoving }: CardActionsProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs }}>
      <LoadingButton accessibilityLabel={`${MESSAGES.edit} ${subject}`} disabled={isRemoving} onPress={onEdit} style={{ flex: 1 }} variant="secondary">
        {MESSAGES.edit}
      </LoadingButton>
      <LoadingButton
        accessibilityLabel={`${MESSAGES.remove} ${subject}`}
        isLoading={isRemoving}
        loadingText={MESSAGES.removing}
        onPress={onRemove}
        style={{ flex: 1 }}
        variant="ghost"
      >
        {MESSAGES.remove}
      </LoadingButton>
    </View>
  );
}
