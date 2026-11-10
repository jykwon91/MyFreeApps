import RequireWrite from "../workspace/RequireWrite";
import LeaseTemplateDetailSkeleton from "./LeaseTemplateDetailSkeleton";
import LeaseTemplateFormScreen from "./LeaseTemplateFormScreen";

export default function LeaseTemplateCreateScreen() {
  return (
    <RequireWrite loading={<LeaseTemplateDetailSkeleton />}>
      <LeaseTemplateFormScreen />
    </RequireWrite>
  );
}
