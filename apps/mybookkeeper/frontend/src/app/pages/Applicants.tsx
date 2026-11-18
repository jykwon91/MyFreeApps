import { useMemo } from "react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useApplicantsPages } from "@mybookkeeper/api-client/hooks/useApplicantsPages";
import { APPLICANT_STAGES } from "@mybookkeeper/api-client/constants/applicantLabels";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import ApplicantStageFilter from "@/app/features/applicants/ApplicantStageFilter";
import ApplicantsListBody from "@/app/features/applicants/ApplicantsListBody";
import { pagedListView } from "@/shared/lib/paged-list-view";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import { useLiveSearchParams } from "@platform/ui";

const STAGE_PARAM = "stage";

function parseStageParam(value: string | null): ApplicantStage | null {
  if (value === null) return null;
  return (APPLICANT_STAGES as readonly string[]).includes(value)
    ? (value as ApplicantStage)
    : null;
}

export default function Applicants() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const stage = parseStageParam(searchParams.get(STAGE_PARAM));

  const queryArgs = useMemo(() => (stage ? { stage } : {}), [stage]);
  const pages = useApplicantsPages(queryArgs);
  const { mode, rows } = pagedListView(pages, pages.applicants);

  const isFiltered = !!stage;
  const showStageBadge = !stage;

  function handleFilterChange(next: ApplicantStage | null) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) {
          params.set(STAGE_PARAM, next);
        } else {
          params.delete(STAGE_PARAM);
        }
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Applicants"
        subtitle="People you've promoted from inquiries — track screening and approvals here."
      />

      <ApplicantStageFilter value={stage} onChange={handleFilterChange} />

      <ListPagesErrorAlert pages={pages} noun="applicants" />

      <ApplicantsListBody
        mode={mode}
        applicants={rows}
        showStageBadge={showStageBadge}
        isFiltered={isFiltered}
        hasMore={pages.hasNextPage}
        isLoadingMore={pages.isFetchingNextPage}
        onLoadMore={pages.loadMore}
      />
    </div>
  );
}
