import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import { LoadingButton } from "@platform/ui";
import { useGetWelcomeManualsQuery } from "@/shared/store/welcomeManualsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { WELCOME_MANUAL_PAGE_SIZE } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualSummary } from "@/shared/types/welcome-manual/welcome-manual-summary";
import WelcomeManualsListBody from "@/app/features/welcome-manuals/WelcomeManualsListBody";
import WelcomeManualCreateDialog from "@/app/features/welcome-manuals/WelcomeManualCreateDialog";
import { useWelcomeManualsListMode } from "@/app/features/welcome-manuals/useWelcomeManualsListMode";

export default function WelcomeManuals() {
  const navigate = useNavigate();
  const [pageCount, setPageCount] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const queryArgs = useMemo(
    () => ({ limit: WELCOME_MANUAL_PAGE_SIZE * pageCount, offset: 0 }),
    [pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetWelcomeManualsQuery(queryArgs);
  const { data: properties = [] } = useGetPropertiesQuery();

  const manuals = data?.items ?? [];
  const hasMore = data?.has_more ?? false;

  const propertyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties) {
      map.set(p.id, p.name);
    }
    return map;
  }, [properties]);

  const propertyName = (m: WelcomeManualSummary): string | null =>
    m.property_id ? propertyById.get(m.property_id) ?? "Unknown property" : null;

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  const mode = useWelcomeManualsListMode({
    isLoading,
    isError,
    manualCount: manuals.length,
  });

  return (
    <main className="p-4 sm:p-8 space-y-6">
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

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your welcome manuals. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      <WelcomeManualsListBody
        mode={mode}
        manuals={manuals}
        propertyName={propertyName}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
        onCreateFirst={() => setShowCreate(true)}
      />

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
    </main>
  );
}
