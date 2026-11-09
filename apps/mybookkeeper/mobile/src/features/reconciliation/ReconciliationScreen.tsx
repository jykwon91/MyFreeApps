import { useListSourcesQuery } from "@mybookkeeper/api-client/store/reconciliationApi";
import { reconciliationSourcesMode } from "@mybookkeeper/api-client/utils/reconciliationModes";
import { reconciliationTaxYears } from "@mybookkeeper/api-client/utils/reconciliationTaxYears";
import { EmptyState, OptionSheet, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import type { ReconciliationFilter } from "../../types/ReconciliationFilter";
import { useCanWrite } from "../workspace/useCanWrite";
import { allMatchHeading, needsLook, noSourcesHeading, sourcesFor } from "./reconciliationDisplay";
import ReconciliationHeader from "./ReconciliationHeader";
import ReconciliationRow from "./ReconciliationRow";
import ReconciliationSkeleton from "./ReconciliationSkeleton";
import { useCompareWithRecords } from "./useCompareWithRecords";

export default function ReconciliationScreen() {
  const canWrite = useCanWrite();
  const [years] = useState(() => reconciliationTaxYears(new Date()));
  const [year, setYear] = useState(years[0]);
  const [filter, setFilter] = useState<ReconciliationFilter>("all");
  const [isChoosingYear, setIsChoosingYear] = useState(false);
  const { currentData, error, isFetching, refetch } = useListSourcesQuery({ tax_year: year });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { compare, isComparing } = useCompareWithRecords(year);

  const sources = currentData ?? [];
  const openAddForm = () => router.push(`/reconciliation/add?year=${year}`);

  function emptyList() {
    const mode = reconciliationSourcesMode(isFetching && !currentData, sources.length);
    // No answer yet and nothing in flight means the load failed, which is not the same as having none.
    if (!currentData && mode !== "loading") {
      return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
    }
    if (mode === "loading") return <ReconciliationSkeleton />;
    if (mode === "list") return <EmptyState body={MESSAGES.nothingNeedsLook} heading={allMatchHeading(year)} />;
    return (
      <EmptyState
        action={canWrite ? { label: MESSAGES.add, onPress: openAddForm } : undefined}
        body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
        heading={noSourcesHeading(year)}
      />
    );
  }

  return (
    <>
      <FlatList
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          <ReconciliationHeader
            canWrite={canWrite}
            filter={filter}
            isComparing={isComparing}
            needsLookCount={sources.filter(needsLook).length}
            onAdd={openAddForm}
            onChangeFilter={setFilter}
            onChooseYear={() => setIsChoosingYear(true)}
            onCompare={() => void compare()}
            showLastLoaded={Boolean(error) && currentData !== undefined}
            totalCount={sources.length}
            year={year}
          />
        }
        contentInsetAdjustmentBehavior="automatic"
        data={sourcesFor(sources, filter)}
        keyExtractor={(source) => source.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <ReconciliationRow canWrite={canWrite} source={item} year={year} />}
        testID="reconciliation-list"
      />
      <OptionSheet
        isOpen={isChoosingYear}
        onClose={() => setIsChoosingYear(false)}
        onSelect={(chosen) => {
          setIsChoosingYear(false);
          setYear(Number(chosen));
          setFilter("all");
        }}
        options={years.map((choice) => ({ value: String(choice), label: String(choice) }))}
        title={MESSAGES.taxYear}
        value={String(year)}
      />
    </>
  );
}
