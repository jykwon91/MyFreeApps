import { useGetFormFieldsQuery } from "@mybookkeeper/api-client/store/taxReturnsApi";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Banner, EmptyState, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { SectionList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TAX_FORM_MESSAGES as MESSAGES, TAX_FORM_SKELETON_ROWS } from "../../constants/taxForm";
import type { TaxFormSection } from "../../types/TaxFormSection";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useIsAdmin } from "../workspace/useIsAdmin";
import TaxFieldRow from "./TaxFieldRow";
import { taxFormSections } from "./taxFormDisplay";
import TaxFormSectionHeader from "./TaxFormSectionHeader";

/** Every field on one form, a section per copy of it. Owners and admins can open a field to override it. */
export default function TaxFormScreen({ returnId, formName }: { returnId: string; formName: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const isAdmin = useIsAdmin();
  const { currentData, error, isFetching, refetch } = useGetFormFieldsQuery({ return_id: returnId, form_name: formName });
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const sections = useMemo(() => (currentData ? taxFormSections(currentData) : []), [currentData]);

  // A form removed by a recalculation keeps its last-loaded copy, and retrying can't bring it back.
  if (isNotFound(error)) return <EmptyState body={MESSAGES.couldntFindBody} heading={MESSAGES.couldntFind} />;
  if (!currentData) {
    if (isFetching) {
      return (
        <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="tax-form-skeleton">
          {TAX_FORM_SKELETON_ROWS.map((row) => (
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

  const override = (field: TaxFormField) =>
    router.push(`/tax-returns/${returnId}/override?form=${encodeURIComponent(formName)}&field=${encodeURIComponent(field.id)}`);

  return (
    <SectionList<TaxFormField, TaxFormSection>
      ListEmptyComponent={<EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, padding: spacing.lg }}>
          {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          {!isAdmin && sections.length > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.readOnlyNote}</Text> : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      keyExtractor={(field) => field.id}
      refreshControl={refreshControl}
      renderItem={({ item, section }) => <TaxFieldRow field={item} instance={section.instance} onOverride={isAdmin ? () => override(item) : undefined} />}
      renderSectionHeader={({ section }) => <TaxFormSectionHeader onViewDocument={(documentId) => router.push(`/documents/${documentId}`)} section={section} />}
      sections={sections}
      stickySectionHeadersEnabled={false}
      testID="tax-form-list"
    />
  );
}
