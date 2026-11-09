import { useGetFormFieldsQuery } from "@mybookkeeper/api-client/store/taxReturnsApi";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { EmptyState, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { TAX_FIELD_OVERRIDE_MESSAGES as MESSAGES } from "../../constants/taxFieldOverride";
import { TAX_FORM_SKELETON_ROWS } from "../../constants/taxForm";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useIsAdmin } from "../workspace/useIsAdmin";
import TaxFieldOverrideForm from "./TaxFieldOverrideForm";

interface TaxFieldOverrideScreenProps {
  returnId: string;
  formName: string;
  /** The field's own id, not its name: two copies of a form can share a name. */
  fieldRowId: string;
}

/** Waits for the field so the form opens on its current value, and keeps what's typed when the form reloads. */
export default function TaxFieldOverrideScreen({ returnId, formName, fieldRowId }: TaxFieldOverrideScreenProps) {
  const { spacing } = useTheme();
  const isAdmin = useIsAdmin();
  const { currentData, error, isFetching, refetch } = useGetFormFieldsQuery({ return_id: returnId, form_name: formName });
  const { refresh } = useRefresh(refetch, error);

  if (!isAdmin) return <EmptyState body={MESSAGES.viewOnlyBody} heading={MESSAGES.viewOnlyHeading} />;
  if (isNotFound(error)) return <EmptyState body={MESSAGES.couldntFindBody} heading={MESSAGES.couldntFind} />;
  if (!currentData) {
    if (isFetching) {
      return (
        <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="tax-override-skeleton">
          {TAX_FORM_SKELETON_ROWS.slice(0, 3).map((row) => (
            <Skeleton height={56} key={row} width="100%" />
          ))}
        </View>
      );
    }
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={isServerAnswer(error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoad}
      />
    );
  }
  const field = currentData.instances.flatMap((instance) => instance.fields).find((candidate) => candidate.id === fieldRowId);
  if (!field) return <EmptyState body={MESSAGES.couldntFindBody} heading={MESSAGES.couldntFind} />;
  return <TaxFieldOverrideForm field={field} key={field.id} returnId={returnId} />;
}
