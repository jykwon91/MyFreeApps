import { useGetTaxCompletenessQuery } from "@mybookkeeper/api-client/store/taxCompletenessApi";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { ScrollView, Text, View } from "react-native";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../../constants/taxReview";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { findReviewForm, reviewFormTitle } from "./taxReviewDisplay";
import TaxReviewFieldList from "./TaxReviewFieldList";
import TaxReviewProgress from "./TaxReviewProgress";
import TaxReviewSkeleton from "./TaxReviewSkeleton";

interface TaxReviewFormScreenProps {
  year: number;
  formName: string;
  /** Which copy of the form, when the return has several. Empty when it has no label. */
  instance: string;
  /** Which of several copies sharing that name and label, counting from 0. */
  copy: number;
}

/** What I found on one form and what I didn't, from the review the list was built from. */
export default function TaxReviewFormScreen({ year, formName, instance, copy }: TaxReviewFormScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData, error, isFetching, refetch } = useGetTaxCompletenessQuery({ taxYear: year });
  const { refresh, refreshControl } = useRefresh(refetch, error);

  if (isNotFound(error)) return <EmptyState body={MESSAGES.couldntFindFormBody} heading={MESSAGES.couldntFindForm} />;
  if (!currentData) {
    if (isFetching) return <TaxReviewSkeleton />;
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={isServerAnswer(error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoad(year)}
      />
    );
  }
  const form = findReviewForm(currentData.forms, formName, instance, copy);
  if (!form) return <EmptyState body={MESSAGES.couldntFindFormBody} heading={MESSAGES.couldntFindForm} />;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} refreshControl={refreshControl} testID="tax-review-form">
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.foreground }}>
        {reviewFormTitle(form)}
      </Text>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <TaxReviewProgress form={form} />
      {form.highlights.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {form.highlights.map((highlight) => (
            <Text key={highlight} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {highlight}
            </Text>
          ))}
        </View>
      ) : null}
      {form.filled_fields.length === 0 && form.missing_fields.length === 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.nothingFound}</Text>
      ) : null}
      <TaxReviewFieldList fields={form.filled_fields} title={MESSAGES.found} />
      <TaxReviewFieldList fields={form.missing_fields} title={MESSAGES.notFound} />
    </ScrollView>
  );
}
