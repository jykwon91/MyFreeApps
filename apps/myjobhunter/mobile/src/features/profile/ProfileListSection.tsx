import { EmptyState, LoadingButton, SectionError, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { ProfileListSectionProps } from "../../types/ProfileListSectionProps";
import SectionHeading from "../applicationDetail/SectionHeading";
import SectionSkeletonCards from "../applicationDetail/SectionSkeletonCards";

/**
 * A profile list: its heading, then a skeleton while it loads, the reason and a retry if that fails,
 * or Add over the list or its empty state. A failed refresh keeps the list on screen.
 */
export default function ProfileListSection<Item>({
  title,
  state,
  loadingLabel,
  couldntLoad,
  tryAgain,
  emptyHeading,
  emptyBody,
  addLabel,
  onAdd,
  addDisabledReason,
  renderItems,
  testID,
}: ProfileListSectionProps<Item>) {
  const { colors, spacing, fontSize } = useTheme();
  const { items } = state;
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <SectionHeading count={items?.length} title={title} />
      {items ? (
        <>
          <LoadingButton disabled={addDisabledReason !== undefined} onPress={onAdd} variant="secondary">
            {addLabel}
          </LoadingButton>
          {addDisabledReason ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{addDisabledReason}</Text> : null}
          {items.length === 0 ? <EmptyState body={emptyBody} heading={emptyHeading} /> : renderItems(items)}
        </>
      ) : state.hasError ? (
        <SectionError message={couldntLoad} onRetry={state.retry} retryLabel={tryAgain} />
      ) : (
        <SectionSkeletonCards label={loadingLabel} testID={`${testID}-skeleton`} />
      )}
    </View>
  );
}
