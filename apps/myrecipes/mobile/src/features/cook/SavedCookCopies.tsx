import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COOK_COPY_MESSAGES } from "../../constants/cook";
import type { SavedCookCopiesProps } from "../../types/SavedCookCopiesProps";

/** The recipes that can still be cooked offline, for when the list itself can't load. */
export default function SavedCookCopies({ copies, onOpen }: SavedCookCopiesProps) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {COOK_COPY_MESSAGES.savedHeading}
      </Text>
      {copies.map((copy) => (
        <LoadingButton
          accessibilityLabel={COOK_COPY_MESSAGES.cookTitle(copy.title)}
          key={copy.recipeId}
          onPress={() => onOpen(copy.recipeId)}
          variant="secondary"
        >
          {copy.title}
        </LoadingButton>
      ))}
    </View>
  );
}
