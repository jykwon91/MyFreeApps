import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { EmptyState } from "@platform/ui";
import CompaniesSkeleton from "@/features/companies/CompaniesSkeleton";
import { EMPTY_STATES } from "@/constants/empty-states";

// Phase 1: no data yet — simulate instant load then show empty state
const IS_LOADING = false;

export default function Companies() {
  const navigate = useNavigate();
  const copy = EMPTY_STATES.companies;

  if (IS_LOADING) {
    return <CompaniesSkeleton />;
  }

  return (
    <div className="p-6">
      <EmptyState
        icon={<Building2 className="w-12 h-12" />}
        heading={copy.heading}
        body={copy.body}
        action={{
          label: copy.actionLabel,
          onClick: () => navigate("/applications"),
        }}
      />
    </div>
  );
}
