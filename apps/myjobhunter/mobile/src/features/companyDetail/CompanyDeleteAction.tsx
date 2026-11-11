import { useDeleteCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import { isCompanyHasApplicationsError } from "@myjobhunter/api-client/utils/isCompanyHasApplicationsError";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import { useConfirmedRemoval } from "../../hooks/useConfirmedRemoval";
import type { CompanyDeleteActionProps } from "../../types/CompanyDeleteActionProps";

/**
 * The website's Delete, after asking. It waits for the company's applications to load and stays off
 * while there are any, saying why. If the server refuses anyway its reason shows and the list
 * reloads; if the company is already gone the screen leaves as after a delete.
 */
export default function CompanyDeleteAction({ company, deleteState, isLeaving, onDeleted, onRefused }: CompanyDeleteActionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [deleteCompany] = useDeleteCompanyMutation();
  // Already gone (deleted elsewhere) is what was asked for, so the screen leaves as after a delete.
  const { isRemoving, confirmRemove } = useConfirmedRemoval(
    () => deleteCompany(company.id).unwrap(),
    {
      removeTitle: MESSAGES.deleteTitle(company.name),
      removeBody: MESSAGES.deleteBody,
      remove: MESSAGES.delete,
      keep: MESSAGES.keep,
      removed: MESSAGES.deleted(company.name),
      gone: MESSAGES.gone,
      couldntRemove: MESSAGES.couldntDelete,
    },
    {
      onRemoved: onDeleted,
      refusalMessage: (error) => (isCompanyHasApplicationsError(error) ? error.data.detail.message : null),
      onRefused,
    },
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton
        accessibilityHint={deleteState === "waiting" ? MESSAGES.deleteWaiting : undefined}
        disabled={deleteState !== "allowed" || isLeaving}
        isLoading={isRemoving}
        loadingText={MESSAGES.deleting}
        onPress={confirmRemove}
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
