import { LoadingButton } from "@platform/ui";
import EmptyState from "@/shared/components/ui/EmptyState";
import type { WelcomeManualsListMode } from "@/shared/types/welcome-manual/welcome-manuals-list-mode";
import type { WelcomeManualSummary } from "@/shared/types/welcome-manual/welcome-manual-summary";
import WelcomeManualsSkeleton from "./WelcomeManualsSkeleton";
import WelcomeManualCard from "./WelcomeManualCard";
import WelcomeManualTableRow from "./WelcomeManualTableRow";

export interface WelcomeManualsListBodyProps {
  mode: WelcomeManualsListMode;
  manuals: WelcomeManualSummary[];
  propertyName: (m: WelcomeManualSummary) => string | null;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
  onCreateFirst: () => void;
}

export default function WelcomeManualsListBody({
  mode,
  manuals,
  propertyName,
  hasMore,
  isFetching,
  onLoadMore,
  onCreateFirst,
}: WelcomeManualsListBodyProps) {
  switch (mode) {
    case "loading":
      return <WelcomeManualsSkeleton />;
    case "empty":
      return (
        <EmptyState
          message="No welcome manuals yet. Create a guide so your guests have everything they need — Wi-Fi, parking, trash day, check-out — in one place."
          action={{ label: "Create your first guide", onClick: onCreateFirst }}
        />
      );
    case "list":
      return (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="welcome-manuals-mobile">
            {manuals.map((manual) => (
              <li key={manual.id}>
                <WelcomeManualCard manual={manual} propertyName={propertyName(manual)} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="welcome-manuals-desktop"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Property</th>
                  <th className="px-4 py-2 font-medium">Sections</th>
                  <th className="px-4 py-2 font-medium text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {manuals.map((manual) => (
                  <WelcomeManualTableRow
                    key={manual.id}
                    manual={manual}
                    propertyName={propertyName(manual)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="flex justify-center">
              <LoadingButton
                variant="secondary"
                onClick={onLoadMore}
                isLoading={isFetching}
                loadingText="Loading..."
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </>
      );
  }
}
