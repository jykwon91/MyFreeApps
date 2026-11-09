import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetDuplicatesQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { useCanWrite } from "../workspace/useCanWrite";
import DuplicateCompare from "./DuplicateCompare";
import DuplicateCompareSkeleton from "./DuplicateCompareSkeleton";

export default function DuplicateCompareScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { data, error, isLoading, refetch } = useGetDuplicatesQuery();
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const pair = data?.pairs.find((candidate) => candidate.id === id);

  if (isLoading) return <DuplicateCompareSkeleton />;
  if (!pair) {
    return data ? (
      <EmptyState action={{ label: MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.pairGoneBody} heading={MESSAGES.pairGoneHeading} />
    ) : (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
    );
  }

  return <DuplicateCompare canWrite={canWrite} isStale={Boolean(error)} key={pair.id} pair={pair} properties={properties} refreshControl={refreshControl} />;
}
