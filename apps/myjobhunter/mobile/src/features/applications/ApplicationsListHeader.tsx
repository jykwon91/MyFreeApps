import { Banner, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { APPLICATION_MESSAGES as MESSAGES } from "../../constants/applications";
import type { ApplicationsListHeaderProps } from "../../types/ApplicationsListHeaderProps";

export default function ApplicationsListHeader({ isStale, hasRows, sortLabel, onAdd, onSort }: ApplicationsListHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {hasRows ? (
        <>
          <LoadingButton onPress={onAdd}>{MESSAGES.addOnWebsite}</LoadingButton>
          <LoadingButton onPress={onSort} variant="secondary">
            {`${MESSAGES.sort}: ${sortLabel}`}
          </LoadingButton>
        </>
      ) : null}
    </View>
  );
}
