import { useGetTaxCompletenessQuery } from "@mybookkeeper/api-client/store/taxCompletenessApi";
import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import { Banner, EmptyState, LoadingButton, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TAX_REPORT_MESSAGES } from "../../constants/taxReport";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../../constants/taxReview";
import { useToday } from "../../lib/useToday";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { isServerAnswer } from "../../utils/isServerAnswer";
import PickerField from "../transactions/PickerField";
import { useCanWrite } from "../workspace/useCanWrite";
import { taxYears } from "./taxReportDisplay";
import { reviewCopyNumber, reviewFormOrder } from "./taxReviewDisplay";
import TaxReviewFormRow from "./TaxReviewFormRow";
import TaxReviewSkeleton from "./TaxReviewSkeleton";

export default function TaxReviewScreen() {
  const { colors, spacing, fontSize, radius } = useTheme();
  const canWrite = useCanWrite();
  const today = useToday();
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [isChoosingYear, setIsChoosingYear] = useState(false);
  const year = chosenYear ?? today.getFullYear() - 1;
  const { currentData, error, isFetching, refetch } = useGetTaxCompletenessQuery({ taxYear: year });
  const { refresh, refreshControl } = useRefresh(refetch, error);

  // The server answers 404 when there's no return for the year, which means nothing has been read yet.
  // It also wins over a last-loaded copy, since that return is gone.
  const noReturn = isNotFound(error);
  const review = noReturn ? undefined : currentData;
  const forms = useMemo(() => reviewFormOrder(review?.forms ?? []), [review]);
  const hasForms = forms.length > 0;
  const yearOptions = taxYears(today).map((option) => ({ value: String(option), label: String(option) }));
  const addDocument = () => router.push("/camera");

  function emptyList() {
    if (noReturn || review) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.addDocument, onPress: addDocument } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading(year)}
        />
      );
    }
    if (isFetching) return <TaxReviewSkeleton />;
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={isServerAnswer(error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoad(year)}
      />
    );
  }

  return (
    <>
      <FlatList<FormCompleteness>
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <PickerField
              hint={TAX_REPORT_MESSAGES.yearHint}
              label={TAX_REPORT_MESSAGES.year}
              onPress={() => setIsChoosingYear(true)}
              value={String(year)}
            />
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.note}</Text>
            {error && review ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {hasForms && review?.needs_recompute ? <Banner message={MESSAGES.outOfDate} /> : null}
            {review && hasForms ? (
              <>
                {review.summary ? (
                  <View accessible style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.muted }}>
                    <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>
                      {MESSAGES.summaryTitle}
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{review.summary}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{MESSAGES.formCount(forms.length, year)}</Text>
                <LoadingButton onPress={() => router.push(`/tax-returns/${review.tax_return_id}`)} variant="secondary">
                  {MESSAGES.openReturn(year)}
                </LoadingButton>
                {canWrite ? (
                  <LoadingButton onPress={addDocument} variant="secondary">
                    {MESSAGES.addDocument}
                  </LoadingButton>
                ) : null}
              </>
            ) : null}
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={forms}
        keyExtractor={(form, index) => `${form.form_name}:${form.instance_label ?? ""}:${index}`}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <TaxReviewFormRow
            form={item}
            onPress={() =>
              router.push(`/tax/review-form?year=${year}&form=${encodeURIComponent(item.form_name)}&instance=${encodeURIComponent(item.instance_label ?? "")}&copy=${reviewCopyNumber(forms, item)}`)
            }
          />
        )}
        testID="tax-review-list"
      />
      <OptionSheet
        isOpen={isChoosingYear}
        onClose={() => setIsChoosingYear(false)}
        onSelect={(chosen) => {
          setIsChoosingYear(false);
          setChosenYear(Number(chosen));
        }}
        options={yearOptions}
        title={TAX_REPORT_MESSAGES.year}
        value={String(year)}
      />
    </>
  );
}
