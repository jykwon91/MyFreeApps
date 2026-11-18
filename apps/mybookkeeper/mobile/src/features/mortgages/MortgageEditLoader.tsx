import { useGetMortgageByIdQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState, goBackOr } from "@platform/mobile";
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
      action={isGone ? { label: MORTGAGE_MESSAGES.back, onPress: () => goBackOr("/mortgages") } : { label: MORTGAGE_MESSAGES.tryAgain, onPress: () => refetch() }}
      body={isGone ? MORTGAGE_MESSAGES.maybeDeleted : MORTGAGE_MESSAGES.tryAgainOffer}
      heading={isGone ? MORTGAGE_MESSAGES.cantFind : MORTGAGE_MESSAGES.couldntLoadOne}
    />
  );
}
