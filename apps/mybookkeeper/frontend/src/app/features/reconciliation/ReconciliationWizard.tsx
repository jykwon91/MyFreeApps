import { useState } from "react";
import { getYear } from "date-fns";
import { Link } from "react-router-dom";
import { STEPS } from "@/shared/lib/reconciliation-config";
import {
  useUpload1099Mutation,
  useListSourcesQuery,
  useGetDiscrepanciesQuery,
} from "@/shared/store/reconciliationApi";
import Select from "@/shared/components/ui/Select";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Card from "@/shared/components/ui/Card";
import { useReconciliationSourcesMode } from "./useReconciliationSourcesMode";
import { useReconciliationDiscrepanciesMode } from "./useReconciliationDiscrepanciesMode";
import ReconciliationSourcesBody from "./ReconciliationSourcesBody";
import ReconciliationDiscrepanciesBody from "./ReconciliationDiscrepanciesBody";


export interface ReconciliationWizardProps {
  onToast: (message: string, variant: "success" | "error") => void;
  canWrite?: boolean;
}

export default function ReconciliationWizard({ onToast, canWrite = true }: ReconciliationWizardProps) {
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

  const sourcesMode = useReconciliationSourcesMode({ isLoading: sourcesLoading, sources });
  const discrepanciesMode = useReconciliationDiscrepanciesMode({ isLoading: discrepanciesLoading, count: discrepancies.length });

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
          <ReconciliationSourcesBody
            mode={sourcesMode}
            sources={sources}
            onUploadStep={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        </Card>
      )}

      {step === 2 && (
        <Card>
          <ReconciliationDiscrepanciesBody
            mode={discrepanciesMode}
            discrepancies={discrepancies}
          />
        </Card>
      )}
    </div>
  );
}
