import { useGetMortgageByIdQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import MortgageDetailSkeleton from "./MortgageDetailSkeleton";
import MortgageForm from "./MortgageForm";

export default function MortgageEditLoader({ id }: { id: string }) {
  const { currentData: mortgage, error, isFetching, refetch } = useGetMortgageByIdQuery(id);

  // Keyed so a reload can't replace what's being typed.
  if (mortgage) return <MortgageForm key={mortgage.id} original={mortgage} />;
  if (!error || isFetching) return <MortgageDetailSkeleton />;
  const isGone = httpStatus(error) === 404;
  return (
    <EmptyState
      action={isGone ? { label: MORTGAGE_MESSAGES.back, onPress: () => router.back() } : { label: MORTGAGE_MESSAGES.tryAgain, onPress: () => void refetch() }}
      body={isGone ? MORTGAGE_MESSAGES.maybeDeleted : MORTGAGE_MESSAGES.tryAgainOffer}
      heading={isGone ? MORTGAGE_MESSAGES.cantFind : MORTGAGE_MESSAGES.couldntLoadOne}
    />
  );
}
