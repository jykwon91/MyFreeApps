/**
 * Dashboard page — kanban board + side-drawer detail.
 *
 * URL state lives here (not in RootLayout): ``?app=<id>`` opens the drawer
 * for that application. Mount-time read enables deep-linking. Closing the
 * drawer ``replace``s the URL so back-button doesn't re-open it.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import KanbanBoard from "@/features/kanban/KanbanBoard";
import ApplicationDrawer from "@/features/applications/ApplicationDrawer";
import DashboardSkeleton from "@/features/dashboard/DashboardSkeleton";
import { useListApplicationsKanbanQuery } from "@/lib/applicationsApi";

const APP_QUERY_PARAM = "app";

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAppId = searchParams.get(APP_QUERY_PARAM);

  const { data, isLoading } = useListApplicationsKanbanQuery();

  const selectCard = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(APP_QUERY_PARAM, id);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const closeDrawer = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(APP_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const items = data?.items ?? [];

  return (
    <>
      <KanbanBoard items={items} onSelectCard={selectCard} />
      <ApplicationDrawer applicationId={selectedAppId} onClose={closeDrawer} />
    </>
  );
}
