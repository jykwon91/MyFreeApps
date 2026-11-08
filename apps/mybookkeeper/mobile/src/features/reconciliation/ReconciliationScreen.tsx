import { useListSourcesQuery } from "@mybookkeeper/api-client/store/reconciliationApi";
import { EmptyState, OptionSheet, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import type { ReconciliationFilter } from "../../types/ReconciliationFilter";
import { useCanWrite } from "../workspace/useCanWrite";
import { allMatchHeading, needsLook, noSourcesHeading, sourcesFor, taxYearChoices } from "./reconciliationDisplay";
import ReconciliationHeader from "./ReconciliationHeader";
import ReconciliationRow from "./ReconciliationRow";
import ReconciliationSkeleton from "./ReconciliationSkeleton";
import { useCompareWithRecords } from "./useCompareWithRecords";

export default function ReconciliationScreen() {
  const canWrite = useCanWrite();
  const [years] = useState(() => taxYearChoices(new Date()));
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
    if (currentData && currentData.length > 0) return <EmptyState body={MESSAGES.nothingNeedsLook} heading={allMatchHeading(year)} />;
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.add, onPress: openAddForm } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={noSourcesHeading(year)}
        />
      );
    }
    if (isFetching) return <ReconciliationSkeleton />;
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
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
        renderItem={({ item }) => <ReconciliationRow canWrite={canWrite} source={item} />}
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
