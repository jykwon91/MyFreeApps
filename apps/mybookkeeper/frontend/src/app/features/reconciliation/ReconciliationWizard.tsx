import { useState } from "react";
import { getYear } from "date-fns";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";
import { RECONCILIATION_STATUS_STYLES } from "@/shared/lib/constants";
import { STEPS } from "@/shared/lib/reconciliation-config";
import type { ReconciliationSource } from "@/shared/types/reconciliation/reconciliation-source";
import {
  useUpload1099Mutation,
  useListSourcesQuery,
  useGetDiscrepanciesQuery,
} from "@/shared/store/reconciliationApi";
import { Link } from "react-router-dom";
import Select from "@/shared/components/ui/Select";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Card from "@/shared/components/ui/Card";
import EmptyState from "@/shared/components/ui/EmptyState";
import Skeleton from "@/shared/components/ui/Skeleton";


interface Props {
  onToast: (message: string, variant: "success" | "error") => void;
  canWrite?: boolean;
}

export default function ReconciliationWizard({ onToast, canWrite = true }: Props) {
  const currentYear = getYear(new Date());
  const [taxYear, setTaxYear] = useState(currentYear - 1);
  const [step, setStep] = useState(0);

  const [upload1099, { isLoading: isUploading }] = useUpload1099Mutation();
  const { data: sources = [], isLoading: sourcesLoading } = useListSourcesQuery({ tax_year: taxYear });
  const { data: discrepancies = [], isLoading: discrepanciesLoading } = useGetDiscrepanciesQuery(
    { tax_year: taxYear },
    { skip: step < 2 },
  );

  const [sourceType, setSourceType] = useState("1099_k");
  const [issuer, setIssuer] = useState("");
  const [reportedAmount, setReportedAmount] = useState("");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!reportedAmount) return;
    try {
      await upload1099({
        source_type: sourceType,
        tax_year: taxYear,
        issuer: issuer || undefined,
        reported_amount: reportedAmount,
      }).unwrap();
      onToast("1099 source added", "success");
      setIssuer("");
      setReportedAmount("");
      setStep(1);
    } catch {
      onToast("Failed to add 1099 source", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} className="text-xs py-1.5">
          {[currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </div>

      <nav className="flex gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => setStep(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              step === i
                ? "border-primary text-primary bg-muted/50"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i + 1}
              </span>
              {label}
            </span>
          </button>
        ))}
      </nav>

      {step === 0 && (
        <Card>
          {canWrite ? (
            <form onSubmit={handleUpload} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the reported amounts from your 1099 form. I'll compare them against your reservation records.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Source Type</label>
                  <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                    <option value="1099_k">1099-K</option>
                    <option value="1099_misc">1099-MISC</option>
                    <option value="1099_nec">1099-NEC</option>
                    <option value="year_end_statement">Year-End Statement</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Issuer</label>
                  <input
                    type="text"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    placeholder="e.g. Airbnb"
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reported Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={reportedAmount}
                    onChange={(e) => setReportedAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <LoadingButton type="submit" size="sm" isLoading={isUploading} loadingText="Adding...">
                Add 1099 Source
              </LoadingButton>
              <p className="text-xs text-muted-foreground mt-2">
                Have a 1099 PDF?{" "}
                <Link to="/documents" className="text-primary hover:underline font-medium">
                  Upload it on the Documents page
                </Link>{" "}
                and we'll extract the data automatically.
              </p>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">You have read-only access. Adding 1099 sources requires write access.</p>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card>
          {sourcesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <EmptyState
              message="No reconciliation sources yet"
              action={{ label: "Upload a 1099", onClick: () => setStep(0) }}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                Here are the 1099 sources I found. I have automatically matched them against your reservations.
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Each row is one 1099 form or year-end statement. A single form may cover multiple properties.
              </p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Issuer</th>
                    <th className="text-left px-4 py-3 font-medium">Source Document</th>
                    <th className="text-left px-4 py-3 font-medium">Property</th>
                    <th className="text-right px-4 py-3 font-medium">1099 Amount</th>
                    <th className="text-right px-4 py-3 font-medium">Reservation Total</th>
                    <th className="text-right px-4 py-3 font-medium">Discrepancy</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sources.map((source: ReconciliationSource) => (
                    <tr key={source.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">{formatTag(source.source_type)}</td>
                      <td className="px-4 py-3">
                        {source.issuer ?? (source.source_type === "year_end_statement" ? source.document_file_name ?? "\u2014" : "\u2014")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{source.document_file_name ?? "\u2014"}</td>
                      <td className="px-4 py-3">{source.property_name ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(source.reported_amount)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(source.matched_amount)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${parseFloat(source.discrepancy) === 0 ? "text-green-600" : "text-amber-600"}`}>
                        {formatCurrency(source.discrepancy)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RECONCILIATION_STATUS_STYLES[source.status] ?? ""}`}>
                          {formatTag(source.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="flex justify-end pt-2">
                <LoadingButton size="sm" variant="secondary" onClick={() => setStep(2)}>
                  Review Discrepancies
                </LoadingButton>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card>
          {discrepanciesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : discrepancies.length === 0 ? (
            <EmptyState message="No discrepancies found. Everything matches!" />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These sources have discrepancies between reported and matched amounts. Review and resolve them below.
              </p>
              {discrepancies.map((d) => (
                <div key={d.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{formatTag(d.source_type)}</span>
                      {d.issuer && <span className="text-muted-foreground ml-2">{d.issuer}</span>}
                    </div>
                    <span className={`text-sm font-medium ${RECONCILIATION_STATUS_STYLES[d.status] ?? ""} px-2 py-0.5 rounded`}>
                      {formatTag(d.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">1099 Amount</p>
                      <p className="font-medium">{formatCurrency(d.reported_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Reservation Total</p>
                      <p className="font-medium">{formatCurrency(d.matched_amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Discrepancy</p>
                      <p className={`font-medium ${parseFloat(d.discrepancy) === 0 ? "text-green-600" : "text-amber-600"}`}>
                        {formatCurrency(d.discrepancy)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
