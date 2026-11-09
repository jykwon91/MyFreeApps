import { useGetTaxSummaryQuery } from "@mybookkeeper/api-client/store/summaryApi";
import { EmptyState, OptionSheet, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../../constants/taxReport";
import type { TaxReportView } from "../../types/TaxReportView";
import type { TaxRow } from "../../types/TaxRow";
import { useToday } from "../../lib/useToday";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useCanWrite } from "../workspace/useCanWrite";
import TaxW2RowView from "./TaxW2RowView";
import TaxCategoryRowView from "./TaxCategoryRowView";
import TaxPropertyRowView from "./TaxPropertyRowView";
import { availableViews, categoryRows, hasTaxData, propertyRows, taxRowKey, taxYears, w2Rows } from "./taxReportDisplay";
import TaxReportExports from "./TaxReportExports";
import TaxReportHeader from "./TaxReportHeader";
import TaxReportSkeleton from "./TaxReportSkeleton";
import { useShareTaxExport } from "./useShareTaxExport";

export default function TaxReportScreen() {
  const canWrite = useCanWrite();
  const today = useToday();
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [isChoosingYear, setIsChoosingYear] = useState(false);
  const [view, setView] = useState<TaxReportView>("categories");
  const year = chosenYear ?? today.getFullYear() - 1;
  const { currentData, error, isFetching, refetch } = useGetTaxSummaryQuery(year);
  const { refresh, refreshControl } = useRefresh(refetch, error);
  // Here, not in the footer: the footer goes away while another year loads, and a share in progress must not.
  const { sharingId, share } = useShareTaxExport(() => refetch().unwrap());

  const views = useMemo(() => availableViews(currentData), [currentData]);
  // A year without wages has no wages view to be left on, and one with only wages has no categories.
  const shownView = views.includes(view) ? view : views[0];
  const rows = useMemo<readonly TaxRow[]>(() => {
    if (!currentData) return [];
    if (shownView === "w2") return w2Rows(currentData);
    return shownView === "categories" ? categoryRows(currentData) : propertyRows(currentData);
  }, [currentData, shownView]);
  const yearOptions = taxYears(today).map((option) => ({ value: String(option), label: String(option) }));
  const showLastLoaded = Boolean(error) && currentData !== undefined;
  const hasData = currentData !== undefined && hasTaxData(currentData);

  function emptyList() {
    if (rows.length > 0) return undefined;
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.takePhoto, onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading(year)}
        />
      );
    }
    if (isFetching) return <TaxReportSkeleton />;
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
      <FlatList<TaxRow>
        ListEmptyComponent={emptyList()}
        ListFooterComponent={
          currentData ? <TaxReportExports canShare={!showLastLoaded} onShare={share} sharingId={sharingId} showShare={hasData} year={year} /> : undefined
        }
        ListHeaderComponent={
          <TaxReportHeader
            onChangeView={setView}
            onChooseYear={() => setIsChoosingYear(true)}
            showLastLoaded={showLastLoaded}
            summary={currentData}
            view={shownView}
            views={views}
            year={year}
          />
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={taxRowKey}
        refreshControl={refreshControl}
        renderItem={({ item }) => {
          if ("category" in item) return <TaxCategoryRowView row={item} />;
          return "employer" in item ? <TaxW2RowView row={item} /> : <TaxPropertyRowView row={item} />;
        }}
        testID="tax-report-list"
      />
      <OptionSheet
        isOpen={isChoosingYear}
        onClose={() => setIsChoosingYear(false)}
        onSelect={(chosen) => {
          setIsChoosingYear(false);
          setChosenYear(Number(chosen));
        }}
        options={yearOptions}
        title={MESSAGES.year}
        value={String(year)}
      />
    </>
  );
}
