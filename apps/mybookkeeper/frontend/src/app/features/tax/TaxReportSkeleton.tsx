import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

export default function TaxReportSkeleton() {
  return (
    <div className="space-y-6" data-testid="tax-report-skeleton">
      {/* Summary cards — the report's 4-col grid on sm+, with the three
          cards every report has (W-2 Income only shows when there is some) */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4" data-testid="tax-report-skeleton-summary-cards">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-28 mt-1" />
          </Card>
        ))}
      </section>

      {/* By Category table */}
      <section className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left"><Skeleton className="h-3 w-20" /></th>
              <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-16 ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3 flex justify-end"><Skeleton className="h-4 w-20" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* By Property table */}
      <section className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-muted">
              <tr>
                {["w-32", "w-20", "w-20", "w-24"].map((w, i) => (
                  <th key={i} className="px-4 py-3">
                    <Skeleton className={`h-3 ${w} ${i > 0 ? "ml-auto" : ""}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
