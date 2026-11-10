import type { LeaseTemplateGateProps } from "../../types/LeaseTemplateGateProps";
import RequireWrite from "../workspace/RequireWrite";
import LeaseTemplateDetailSkeleton from "./LeaseTemplateDetailSkeleton";
import LeaseTemplateLoader from "./LeaseTemplateLoader";

/** Opens a template for a screen that hangs off it. With requireWrite, a viewer is told they can't and the template isn't fetched. */
export default function LeaseTemplateGate({ requireWrite = false, ...loader }: LeaseTemplateGateProps) {
  return (
    <RequireWrite loading={<LeaseTemplateDetailSkeleton />} required={requireWrite}>
      <LeaseTemplateLoader {...loader} />
    </RequireWrite>
  );
}
