import { LoadingButton, StaleDataBanner, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { APPLICATION_MESSAGES as MESSAGES } from "../../constants/applications";
import type { ApplicationsListHeaderProps } from "../../types/ApplicationsListHeaderProps";

export default function ApplicationsListHeader({ isStale, hasRows, sortLabel, onAdd, onSort }: ApplicationsListHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      <StaleDataBanner isShown={isStale} />
      {hasRows ? (
        <>
          <LoadingButton onPress={onAdd}>{MESSAGES.add}</LoadingButton>
          <LoadingButton onPress={onSort} variant="secondary">
            {`${MESSAGES.sort}: ${sortLabel}`}
          </LoadingButton>
        </>
      ) : null}
    </View>
  );
}
