import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import { useDeleteCookMutation } from "@myrecipes/api-client/store/recipesApi";
import { MIN_TOUCH_TARGET, useConfirmedRemoval, useTheme } from "@platform/mobile";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../../constants/cookLog";
import type { CookLogRowProps } from "../../types/CookLogRowProps";
import { cookRatingLabel } from "../../utils/cookRatingLabel";
import { cookRowFrame } from "../../utils/cookRowFrame";
import { formatVersionDate } from "../../utils/formatVersionDate";
import StarRating from "../recipes/StarRating";

/**
 * One logged cook, as the website's cook log shows it: when, which version, the stars and any notes,
 * and a Delete that asks first. Once deleted, the refreshed log no longer has the row.
 */
export default function CookLogRow({ recipeId, cook, versionNumber }: CookLogRowProps) {
  const theme = useTheme();
  const { colors, spacing, fontSize } = theme;
  const date = formatVersionDate(cook.cooked_at);
  const [deleteCook] = useDeleteCookMutation();
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => deleteCook({ recipeId, cookId: cook.id }).unwrap(), {
    removeTitle: SHARED.deleteTitle,
    removeBody: SHARED.deleteBody,
    remove: SHARED.deleteConfirm,
    keep: MESSAGES.cancel,
    removed: SHARED.deleted,
    gone: MESSAGES.gone,
    couldntRemove: SHARED.couldntDelete,
  });

  return (
    <View style={cookRowFrame(theme)} testID={`cook-${cook.id}`}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
          <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "500" }}>{date}</Text>
          {versionNumber === undefined ? null : (
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>v{versionNumber}</Text>
          )}
          <StarRating accessibilityLabel={cookRatingLabel(cook.rating)} rating={cook.rating} />
        </View>
        {cook.outcome_notes ? (
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{cook.outcome_notes}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityHint={MESSAGES.deleteHint}
        accessibilityLabel={MESSAGES.deleteRowLabel(date)}
        accessibilityRole="button"
        accessibilityState={{ busy: isRemoving, disabled: isRemoving }}
        disabled={isRemoving}
        onPress={confirmRemove}
        style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
      >
        {isRemoving ? (
          <ActivityIndicator color={colors.destructiveText} />
        ) : (
          <Text style={{ color: colors.destructiveText, fontSize: fontSize.sm, fontWeight: "500" }}>{SHARED.deleteConfirm}</Text>
        )}
      </Pressable>
    </View>
  );
}
