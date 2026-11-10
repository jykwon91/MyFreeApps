import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import LeaseTemplatesSkeleton from "../leaseTemplates/LeaseTemplatesSkeleton";
import RequireWrite from "../workspace/RequireWrite";
import TemplatePickerList from "./TemplatePickerList";

/** First step of making a lease. A viewer is told they can't, and no template list is fetched for them. */
export default function TemplatePickerScreen({ flow }: { flow: NewLeaseFlow }) {
  return (
    <RequireWrite loading={<LeaseTemplatesSkeleton />}>
      <TemplatePickerList flow={flow} />
    </RequireWrite>
  );
}
