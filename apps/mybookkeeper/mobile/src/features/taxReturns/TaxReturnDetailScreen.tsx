import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import {
  useGetFormsOverviewQuery,
  useGetSourceDocumentsQuery,
  useGetTaxReturnQuery,
  useGetValidationQuery,
} from "@mybookkeeper/api-client/store/taxReturnsApi";
import { summarizeForms } from "@mybookkeeper/api-client/utils/buildFormSummaries";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, WebLink, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { FILING_STATUSES } from "@mybookkeeper/api-client/constants/taxFilingStatuses";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";
import { isServerAnswer } from "../../utils/isServerAnswer";
import TaxDocumentRowView from "../tax/TaxDocumentRowView";
import { taxDocumentRowKey, taxDocumentSections } from "../tax/taxDocumentsDisplay";
import TaxMissingRowView from "../tax/TaxMissingRowView";
import { useCanWrite } from "../workspace/useCanWrite";
import { useIsAdmin } from "../workspace/useIsAdmin";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { bySeverity, taxReturnTitle, taxReturnWebPath } from "./taxReturnDisplay";
import TaxAdvisorRow from "./TaxAdvisorRow";
import TaxFormRow from "./TaxFormRow";
import TaxReturnSection from "./TaxReturnSection";
import TaxReturnsSkeleton from "./TaxReturnsSkeleton";
import { useRecalculate } from "./useRecalculate";
import ValidationRow from "./ValidationRow";

export default function TaxReturnDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const isAdmin = useIsAdmin();
  const taxReturn = useGetTaxReturnQuery(id);
  const validation = useGetValidationQuery(id);
  const documents = useGetSourceDocumentsQuery(id);
  const forms = useGetFormsOverviewQuery(id);
  const queries = [taxReturn, validation, documents, forms];
  const firstError = queries.find((query) => query.error)?.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all(queries.map((query) => query.refetch())), firstError);
  const { recalculate, isRecalculating } = useRecalculate(taxReturn.currentData);

  // Checked first: a return deleted elsewhere keeps its last-loaded copy, and retrying can't bring it back.
  if (isNotFound(taxReturn.error)) return <EmptyState body={MESSAGES.couldntFindBody} heading={MESSAGES.couldntFind} />;
  const current = taxReturn.currentData;
  if (!current) {
    if (taxReturn.isFetching) return <TaxReturnsSkeleton label={MESSAGES.loadingOne} testID="tax-return-skeleton" />;
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={isServerAnswer(taxReturn.error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoadOne}
      />
    );
  }

  const isStale = queries.some((query) => query.error && query.currentData);
  const addDocument = () => router.push("/camera");
  const sections = documents.currentData ? taxDocumentSections(documents.currentData) : [];
  const results = validation.currentData ? bySeverity(validation.currentData) : [];
  const summaries = forms.currentData ? summarizeForms(forms.currentData, validation.currentData ?? []) : [];
  const statusLine =
    current.status === "filed" && current.filed_at ? MESSAGES.filedOn(formatLongDate(current.filed_at)) : TAX_RETURN_STATUS_LABELS[current.status];
  const filingStatus = FILING_STATUSES.find((option) => option.value === current.filing_status)?.label ?? current.filing_status;
  const openForm = (formName: string) => router.push(`/tax-returns/${id}/form/${encodeURIComponent(formName)}`);
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }} refreshControl={refreshControl} testID="tax-return-detail">
      <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.foreground }}>{taxReturnTitle(current)}</Text>
        <Text style={muted}>{`${statusLine} · ${filingStatus}`}</Text>
        {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        {current.needs_recompute ? <Banner message={MESSAGES.outOfDateDetail} /> : null}
        {isAdmin ? (
          <LoadingButton
            disabled={Boolean(taxReturn.error)}
            isLoading={isRecalculating}
            loadingText={MESSAGES.recalculating}
            onPress={recalculate}
            variant="secondary"
          >
            {MESSAGES.recalculate}
          </LoadingButton>
        ) : current.needs_recompute ? (
          <Text style={muted}>{MESSAGES.adminsOnly}</Text>
        ) : null}
      </View>

      <TaxReturnSection
        emptyMessage={validation.currentData && results.length === 0 ? MESSAGES.noAttention : null}
        failed={!validation.currentData && !validation.isFetching}
        loading={!validation.currentData && validation.isFetching}
        title={MESSAGES.attention}
      >
        {results.map((result, index) => (
          <ValidationRow key={`${result.form_name}:${result.field_id ?? ""}:${index}`} onPress={() => openForm(result.form_name)} result={result} />
        ))}
      </TaxReturnSection>

      <TaxReturnSection
        emptyMessage={documents.currentData && sections.length === 0 ? MESSAGES.noDocuments : null}
        failed={!documents.currentData && !documents.isFetching}
        loading={!documents.currentData && documents.isFetching}
        title={MESSAGES.documents}
      >
        {sections.map((section) => (
          <View key={section.title}>
            <Text style={{ ...muted, fontWeight: "600", paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>{section.title}</Text>
            {section.data.map((row) =>
              "form_instance_id" in row ? (
                <TaxDocumentRowView document={row} key={taxDocumentRowKey(row)} onPress={() => router.push(`/documents/${row.document_id}`)} />
              ) : (
                <TaxMissingRowView item={row} key={taxDocumentRowKey(row)} onAdd={canWrite ? addDocument : undefined} />
              ),
            )}
          </View>
        ))}
      </TaxReturnSection>

      <TaxReturnSection
        emptyMessage={forms.currentData && summaries.length === 0 ? MESSAGES.noForms : null}
        failed={!forms.currentData && !forms.isFetching}
        loading={!forms.currentData && forms.isFetching}
        title={MESSAGES.forms}
      >
        {summaries.map((form) => (
          <TaxFormRow form={form} key={form.form_name} onPress={() => openForm(form.form_name)} />
        ))}
      </TaxReturnSection>

      <TaxAdvisorRow onPress={() => router.push(`/tax-returns/${id}/advisor`)} returnId={id} />

      <View style={{ paddingHorizontal: spacing.lg }}>
        <WebLink label={MESSAGES.webLink} webBaseUrl={WEB_BASE_URL} webPath={taxReturnWebPath(id)} />
      </View>
    </ScrollView>
  );
}
