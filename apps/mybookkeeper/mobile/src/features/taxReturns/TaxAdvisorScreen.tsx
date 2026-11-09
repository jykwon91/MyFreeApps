import {
  useGenerateAdvisorSuggestionsMutation,
  useGetAdvisorSuggestionsQuery,
  useGetFormsOverviewQuery,
  useGetValidationQuery,
} from "@mybookkeeper/api-client/store/taxReturnsApi";
import { summarizeForms } from "@mybookkeeper/api-client/utils/buildFormSummaries";
import { advisorCtaState } from "@mybookkeeper/api-client/utils/taxAdvisorView";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Banner, EmptyState, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { ScrollView, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TAX_ADVISOR_MESSAGES as MESSAGES, TAX_ADVISOR_SKELETON_ROWS } from "../../constants/taxAdvisor";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useIsAdmin } from "../workspace/useIsAdmin";
import TaxAdvisorGenerate from "./TaxAdvisorGenerate";
import TaxAdvisorResults from "./TaxAdvisorResults";

/** The tax advisor for one return: ask for advice, read it, and mark each piece resolved or dismissed. */
export default function TaxAdvisorScreen({ returnId }: { returnId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const isAdmin = useIsAdmin();
  const forms = useGetFormsOverviewQuery(returnId);
  const validation = useGetValidationQuery(returnId);
  const advisor = useGetAdvisorSuggestionsQuery(returnId);
  const [generate, { isLoading: isGenerating, error: generateError, data: generated }] = useGenerateAdvisorSuggestionsMutation();
  const queries = [forms, validation, advisor];
  const firstError = queries.find((query) => query.error)?.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all(queries.map((query) => query.refetch())), firstError);
  const request = () => generate(returnId).unwrap().then(() => undefined, () => undefined);

  const skeleton = (label: string) => (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="tax-advisor-skeleton">
      {TAX_ADVISOR_SKELETON_ROWS.map((row) => (
        <Skeleton height={96} key={row} width="100%" />
      ))}
    </View>
  );
  const failed = (heading: string, error: unknown) => (
    <EmptyState
      action={{ label: MESSAGES.tryAgain, onPress: refresh }}
      body={isServerAnswer(error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
      heading={heading}
    />
  );

  // Which forms the return has decides whether there's anything to review, so it comes before the advice.
  if (!forms.currentData || !validation.currentData) {
    if (forms.isFetching || validation.isFetching) return skeleton(MESSAGES.loading);
    return failed(MESSAGES.couldntLoadForms, forms.error ?? validation.error);
  }
  if (summarizeForms(forms.currentData, validation.currentData).length === 0) {
    return <EmptyState body={MESSAGES.noFormsBody} heading={MESSAGES.noFormsHeading} />;
  }
  if (isGenerating) return skeleton(MESSAGES.reviewing);

  // Right after asking, the advice just written stands in until the refetch lands, so the first-ask prompt never flashes back.
  const cached = advisor.currentData ?? generated;
  // Nothing on file answers 404, which is "ask for advice", not a failure.
  const hasNone = isNotFound(advisor.error) && !generated;
  if (!cached && !hasNone) {
    if (advisor.isFetching) return skeleton(MESSAGES.loading);
    return failed(MESSAGES.couldntLoad, advisor.error);
  }

  const state = advisorCtaState(generateError);
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} refreshControl={refreshControl} testID="tax-advisor">
      {advisor.error && cached ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {cached && !hasNone && cached.suggestions.length === 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.allGoodHeading}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.allGoodBody}</Text>
        </View>
      ) : null}
      <TaxAdvisorGenerate
        isAdmin={isAdmin}
        isFirstAsk={!cached || hasNone}
        isGenerating={isGenerating}
        label={!cached || hasNone ? MESSAGES.getAdvice : MESSAGES.regenerate}
        onGenerate={request}
        state={state}
      />
      {cached && !hasNone && cached.suggestions.length > 0 ? <TaxAdvisorResults cached={cached} returnId={returnId} /> : null}
    </ScrollView>
  );
}
