import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { LoadingButton } from "@platform/ui";
import { useWelcomeManualsPages } from "@mybookkeeper/api-client/hooks/useWelcomeManualsPages";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";
import WelcomeManualsListBody from "@/app/features/welcome-manuals/WelcomeManualsListBody";
import WelcomeManualCreateDialog from "@/app/features/welcome-manuals/WelcomeManualCreateDialog";
import { pagedListView } from "@/shared/lib/paged-list-view";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";

export default function WelcomeManuals() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const pages = useWelcomeManualsPages();
  const { data: properties = [] } = useGetPropertiesQuery();
  const { mode, rows } = pagedListView(pages, pages.manuals);

  const propertyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) {
      map.set(p.id, p.name);
    }
    return map;
  }, [properties]);

  const propertyName = (m: WelcomeManualSummary): string | null =>
    m.property_id ? propertyById.get(m.property_id) ?? "Unknown property" : null;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Welcome Manuals"
        subtitle="Guest guides you can email as a polished PDF — Wi-Fi, parking, check-out, and more."
        actions={
          <LoadingButton
            onClick={() => setShowCreate(true)}
            isLoading={false}
            data-testid="new-welcome-manual-button"
          >
            <Plus className="h-4 w-4 mr-1" />
            New manual
          </LoadingButton>
        }
      />

      <ListPagesErrorAlert pages={pages} noun="welcome manuals" />

      <WelcomeManualsListBody
        mode={mode}
        manuals={rows}
        propertyName={propertyName}
        onCreateFirst={() => setShowCreate(true)}
      />

      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
      ) : null}

      {showCreate ? (
        <WelcomeManualCreateDialog
          properties={properties}
          onClose={() => setShowCreate(false)}
          onCreated={(manual) => {
            setShowCreate(false);
            navigate(`/welcome-manuals/${manual.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
