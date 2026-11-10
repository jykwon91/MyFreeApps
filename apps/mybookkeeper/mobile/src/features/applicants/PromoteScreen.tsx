import RequireWrite from "../workspace/RequireWrite";
import PromoteLoader from "./PromoteLoader";
import PromoteSkeleton from "./PromoteSkeleton";

/** Turns an inquiry into an applicant. A viewer is told they can't, and the inquiry isn't fetched for them. */
export default function PromoteScreen({ id }: { id: string }) {
  return (
    <RequireWrite loading={<PromoteSkeleton />}>
      <PromoteLoader id={id} />
    </RequireWrite>
  );
}
