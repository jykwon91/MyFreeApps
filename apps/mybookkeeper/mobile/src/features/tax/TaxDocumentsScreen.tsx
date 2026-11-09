import { useListTaxDocumentsQuery } from "@mybookkeeper/api-client/store/taxDocumentsApi";
import { Banner, EmptyState, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { ALL_YEARS, TAX_DOCUMENTS_MESSAGES as MESSAGES } from "../../constants/taxDocuments";
import { TAX_REPORT_MESSAGES } from "../../constants/taxReport";
import { useToday } from "../../lib/useToday";
import type { TaxDocumentRow } from "../../types/TaxDocumentRow";
import type { TaxDocumentSection } from "../../types/TaxDocumentSection";
import { isServerAnswer } from "../../utils/isServerAnswer";
import PickerField from "../transactions/PickerField";
import { useCanWrite } from "../workspace/useCanWrite";
import TaxDocumentRowView from "./TaxDocumentRowView";
import TaxDocumentsSkeleton from "./TaxDocumentsSkeleton";
import { taxDocumentRowKey, taxDocumentSections } from "./taxDocumentsDisplay";
import TaxMissingRowView from "./TaxMissingRowView";
import { taxYears } from "./taxReportDisplay";

export default function TaxDocumentsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const today = useToday();
  const [chosenYear, setChosenYear] = useState<number | null | "all">(null);
  const [isChoosingYear, setIsChoosingYear] = useState(false);
  const year = chosenYear === "all" ? null : (chosenYear ?? today.getFullYear() - 1);
  const { currentData, error, isFetching, refetch } = useListTaxDocumentsQuery(year === null ? undefined : { tax_year: year });
  const { refresh, refreshControl } = useRefresh(refetch, error);

  const sections = useMemo<readonly TaxDocumentSection[]>(() => (currentData ? taxDocumentSections(currentData, year === null) : []), [currentData, year]);
  const yearOptions = [{ value: ALL_YEARS, label: MESSAGES.allYears }, ...taxYears(today).map((option) => ({ value: String(option), label: String(option) }))];
  const checklist = currentData?.checklist ?? [];
  const missingCount = checklist.filter((item) => item.status === "missing").length;
  const yearText = year === null ? MESSAGES.allYears : String(year);
  const addDocument = () => router.push("/camera");

  function emptyList() {
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.addDocument, onPress: addDocument } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading(year)}
        />
      );
    }
    if (isFetching) return <TaxDocumentsSkeleton />;
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
      <SectionList<TaxDocumentRow, TaxDocumentSection>
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <PickerField
              hint={TAX_REPORT_MESSAGES.yearHint}
              label={TAX_REPORT_MESSAGES.year}
              onPress={() => setIsChoosingYear(true)}
              value={yearText}
            />
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.readNote}</Text>
            {checklist.length > 0 ? (
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.checklistCount(checklist.length - missingCount, missingCount)}</Text>
            ) : null}
            {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={taxDocumentRowKey}
        refreshControl={refreshControl}
        renderItem={({ item }) =>
          "form_instance_id" in item ? (
            <TaxDocumentRowView document={item} onPress={() => router.push(`/documents/${item.document_id}`)} />
          ) : (
            <TaxMissingRowView item={item} onAdd={canWrite ? addDocument : undefined} />
          )
        }
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={{
              fontSize: fontSize.sm,
              fontWeight: "600",
              color: colors.mutedForeground,
              backgroundColor: colors.background,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xs,
            }}
          >
            {section.title}
          </Text>
        )}
        sections={sections}
        stickySectionHeadersEnabled={false}
        testID="tax-documents-list"
      />
      <OptionSheet
        isOpen={isChoosingYear}
        onClose={() => setIsChoosingYear(false)}
        onSelect={(chosen) => {
          setIsChoosingYear(false);
          setChosenYear(chosen === ALL_YEARS ? "all" : Number(chosen));
        }}
        options={yearOptions}
        title={TAX_REPORT_MESSAGES.year}
        value={year === null ? ALL_YEARS : String(year)}
      />
    </>
  );
}
