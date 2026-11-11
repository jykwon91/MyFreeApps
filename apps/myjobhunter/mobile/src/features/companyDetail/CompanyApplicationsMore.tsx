import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_APPLICATIONS_MESSAGES as MESSAGES } from "../../constants/companyApplications";
import type { CompanyApplicationsMoreProps } from "../../types/CompanyApplicationsMoreProps";

/** Under a company's applications: how many are showing, and a button for the next page. */
export default function CompanyApplicationsMore({ shown, total, isLoading, isError, onLoadMore }: CompanyApplicationsMoreProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" }}>
        {MESSAGES.showingCount(shown, total)}
      </Text>
      {isError && !isLoading ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText, textAlign: "center" }}>
          {MESSAGES.couldntLoadMore}
        </Text>
      ) : null}
      <LoadingButton isLoading={isLoading} loadingText={MESSAGES.loadingMore} onPress={onLoadMore} variant="secondary">
        {isError ? MESSAGES.tryAgain : MESSAGES.loadMore}
      </LoadingButton>
    </View>
  );
}
