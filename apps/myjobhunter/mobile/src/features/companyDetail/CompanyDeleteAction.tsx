import { useDeleteCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import { isCompanyHasApplicationsError } from "@myjobhunter/api-client/utils/isCompanyHasApplicationsError";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Alert, Text, View } from "react-native";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import type { CompanyDeleteActionProps } from "../../types/CompanyDeleteActionProps";

/**
 * The website's Delete, after asking. It waits for the company's applications to load and stays off
 * while there are any, saying why. If the server refuses anyway its reason shows and the list
 * reloads; if the company is already gone the screen leaves as after a delete.
 */
export default function CompanyDeleteAction({ company, deleteState, isLeaving, onDeleted, onRefused }: CompanyDeleteActionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [deleteCompany, { isLoading }] = useDeleteCompanyMutation();

  async function remove(): Promise<void> {
    try {
      await deleteCompany(company.id).unwrap();
      showToast(MESSAGES.deleted(company.name));
      onDeleted();
    } catch (error) {
      if (isNotFound(error)) {
        // Already gone, deleted elsewhere: what was asked for is done, so leave as a delete does.
        showToast(MESSAGES.gone);
        onDeleted();
      } else if (isCompanyHasApplicationsError(error)) {
        showToast(error.data.detail.message, "error");
        onRefused();
      } else {
        showToast(MESSAGES.couldntDelete, "error");
      }
    }
  }

  function confirmDelete(): void {
    Alert.alert(MESSAGES.deleteTitle(company.name), MESSAGES.deleteBody, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.delete, style: "destructive", onPress: () => void remove() },
    ]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton
        accessibilityHint={deleteState === "waiting" ? MESSAGES.deleteWaiting : undefined}
        disabled={deleteState !== "allowed" || isLeaving}
        isLoading={isLoading}
        loadingText={MESSAGES.deleting}
        onPress={confirmDelete}
        variant="destructive"
      >
        {MESSAGES.delete}
      </LoadingButton>
      {deleteState === "blocked" ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.deleteBlocked}</Text>
      ) : null}
    </View>
  );
}
