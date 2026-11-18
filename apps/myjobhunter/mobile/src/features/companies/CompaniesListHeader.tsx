import { LoadingButton, StaleDataBanner, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_MESSAGES as MESSAGES } from "../../constants/companies";
import type { CompaniesListHeaderProps } from "../../types/CompaniesListHeaderProps";

export default function CompaniesListHeader({ isStale, hasRows, sortLabel, onAdd, onSort }: CompaniesListHeaderProps) {
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
