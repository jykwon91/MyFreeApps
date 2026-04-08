import { useCallback, useState } from "react";
import { getYear } from "date-fns";
import { Download, X } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { downloadFile } from "@/shared/utils/download";
import { useGetTaxSummaryQuery } from "@/shared/store/summaryApi";
import { useToast } from "@/shared/hooks/useToast";
import Select from "@/shared/components/ui/Select";
import Button from "@/shared/components/ui/Button";
import TaxReportSkeleton from "@/app/features/tax/TaxReportSkeleton";
import Card from "@/shared/components/ui/Card";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function TaxReport() {
  const currentYear = getYear(new Date());
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("tax-report-info-dismissed");
  const [year, setYear] = useState(currentYear - 1);

  const { data, isLoading } = useGetTaxSummaryQuery(year);
  const { showError } = useToast();

  const handleExportPDF = useCallback(async () => {
    try {
      await downloadFile(`/exports/tax-summary/${year}`, `tax_summary_${year}.pdf`);
    } catch {
      showError("Failed to export tax summary");
    }
  }, [year, showError]);

  const handleExportScheduleE = useCallback(async () => {
    try {
      await downloadFile(`/exports/schedule-e/${year}`, `schedule_e_${year}.pdf`);
    } catch {
      showError("Failed to export Schedule E");
    }
  }, [year, showError]);

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Tax Report"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={handleExportScheduleE}>
              <Download size={14} className="mr-1.5" />
              Schedule E
            </Button>
            <Button size="sm" variant="secondary" onClick={handleExportPDF}>
              <Download size={14} className="mr-1.5" />
              Export PDF
            </Button>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </>
        }
      />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            This is your tax summary for the selected year. Use it to review your deductions or share it with your accountant. It&rsquo;s based on your approved, tax-relevant transactions.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      {isLoading ? (
        <TaxReportSkeleton />
      ) : data ? (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <p className="text-sm text-muted-foreground">Rental Revenue</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{formatCurrency(data.gross_revenue)}</p>
            </Card>
            {(data.w2_total ?? 0) > 0 && (
              <Card>
                <p className="text-sm text-muted-foreground">W-2 Income</p>
                <p className="text-2xl font-semibold text-blue-600 mt-1">{formatCurrency(data.w2_total)}</p>
              </Card>
            )}
            <Card>
              <p className="text-sm text-muted-foreground">Rental Deductions</p>
              <p className="text-2xl font-semibold text-red-500 mt-1">{formatCurrency(data.total_deductions)}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">
                {(data.w2_total ?? 0) > 0 ? "Total Income" : "Net Taxable Income"}
              </p>
              <p className={`text-2xl font-semibold mt-1 ${(data.total_income ?? data.net_taxable_income) >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatCurrency((data.w2_total ?? 0) > 0 ? (data.total_income ?? 0) - data.total_deductions : data.net_taxable_income)}
              </p>
            </Card>
          </section>

          {(data.w2_income?.length ?? 0) > 0 && (
            <section className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted border-b">
                <span className="text-sm font-medium">Employment Income (W-2)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Employer</th>
                    <th className="text-right px-4 py-2.5 font-medium">Wages</th>
                    <th className="text-right px-4 py-2.5 font-medium">Federal Withheld</th>
                    <th className="text-right px-4 py-2.5 font-medium">State Withheld</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.w2_income.map((w2, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <span className="font-medium">{w2.employer ?? "Unknown"}</span>
                        {w2.ein && <span className="text-xs text-muted-foreground ml-2">EIN: {w2.ein}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(w2.wages)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(w2.federal_withheld)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(w2.state_withheld)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {Object.keys(data.by_category).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-1">No tax data for {year}</p>
              <p className="text-sm">Approve some tax-relevant documents to see them here.</p>
            </div>
          ) : (
            <>
              <section className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Category</th>
                      <th className="text-right px-4 py-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.entries(data.by_category).map(([cat, amount]) => (
                      <tr key={cat} className={cat === "uncategorized" ? "bg-amber-50 dark:bg-amber-950/30" : ""}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            {formatTag(cat)}
                            {cat === "uncategorized" && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                Needs review before filing
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {data.by_property.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">By Property</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[480px]">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium">Property</th>
                            <th className="text-right px-4 py-3 font-medium">Revenue</th>
                            <th className="text-right px-4 py-3 font-medium">Expenses</th>
                            <th className="text-right px-4 py-3 font-medium">Net Income</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {data.by_property.map((row) => (
                            <tr key={row.property_id} className="hover:bg-muted/40">
                              <td className="px-4 py-3 font-medium">{row.name ?? "Unassigned"}</td>
                              <td className="px-4 py-3 text-right text-green-600">{formatCurrency(row.revenue)}</td>
                              <td className="px-4 py-3 text-right text-red-500">{formatCurrency(row.expenses)}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${row.net_income >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {formatCurrency(row.net_income)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      ) : null}
    </main>
  );
}
