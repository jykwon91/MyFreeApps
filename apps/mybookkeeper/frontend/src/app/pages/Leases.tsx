import { Link } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetSignedLeasesQuery } from "@/shared/store/signedLeasesApi";
import LeasesListSkeleton from "@/app/features/leases/LeasesListSkeleton";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";

export default function Leases() {
  const { data, isLoading, isFetching, isError, refetch } =
    useGetSignedLeasesQuery();
  const leases = data?.items ?? [];

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Leases"
        subtitle="Generated leases per applicant. Upload signed PDFs and signed-lease attachments here."
      />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your leases. Want me to try again?</span>
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

      {isLoading ? (
        <LeasesListSkeleton />
      ) : leases.length === 0 && !isError ? (
        <EmptyState
          message="No leases yet — generate one from an applicant detail page once you have a template."
        />
      ) : (
        <div
          className="hidden md:block border rounded-lg overflow-hidden"
          data-testid="leases-table"
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Lease</th>
                <th className="px-4 py-2 font-medium">Term</th>
                <th className="px-4 py-2 font-medium">Generated</th>
                <th className="px-4 py-2 font-medium">Signed</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease) => (
                <tr
                  key={lease.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  data-testid={`lease-row-${lease.id}`}
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/leases/${lease.id}`}
                      className="text-primary hover:underline"
                    >
                      Lease {lease.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lease.starts_on ?? "—"} → {lease.ends_on ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lease.generated_at ? formatDate(lease.generated_at) : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lease.signed_at ? formatDate(lease.signed_at) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <SignedLeaseStatusBadge status={lease.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!isLoading && leases.length > 0 ? (
        <ul className="md:hidden space-y-3" data-testid="leases-mobile">
          {leases.map((lease) => (
            <li key={lease.id}>
              <Link
                to={`/leases/${lease.id}`}
                className="block border rounded-lg p-3 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    Lease {lease.id.slice(0, 8)}
                  </span>
                  <SignedLeaseStatusBadge status={lease.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lease.starts_on ?? "—"} → {lease.ends_on ?? "—"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}
