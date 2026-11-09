import { useGetMortgageByIdQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { MORTGAGE_FORM_MESSAGES } from "../../constants/mortgageForm";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { useCanWrite } from "../workspace/useCanWrite";
import MortgageDetailSkeleton from "./MortgageDetailSkeleton";
import MortgageForm from "./MortgageForm";

export default function MortgageEditScreen({ id }: { id: string }) {
  const canWrite = useCanWrite();
  const { currentData: mortgage, error, isFetching, refetch } = useGetMortgageByIdQuery(id);

  if (!canWrite) return <EmptyState body={MORTGAGE_FORM_MESSAGES.viewOnlyBody} heading={MORTGAGE_FORM_MESSAGES.viewOnlyHeading} />;
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
