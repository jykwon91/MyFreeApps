import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getYear, format, parseISO } from "date-fns";
import { Plus, FileText, RefreshCw, X } from "lucide-react";
import {
  useListTaxReturnsQuery,
  useCreateTaxReturnMutation,
} from "@/shared/store/taxReturnsApi";
import { useToast } from "@/shared/hooks/useToast";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Badge from "@/shared/components/ui/Badge";
import Card from "@/shared/components/ui/Card";
import Select from "@/shared/components/ui/Select";
import AlertBox from "@/shared/components/ui/AlertBox";
import { STATUS_BADGE, FILING_STATUSES } from "@/shared/lib/tax-return-config";
import TaxReturnsListSkeleton from "@/app/features/tax/TaxReturnsListSkeleton";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function TaxReturns() {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const currentYear = getYear(new Date());

  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("tax-returns-info-dismissed");
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear] = useState(currentYear);
  const [newFilingStatus, setNewFilingStatus] = useState("single");

  const { data: returns = [], isLoading } = useListTaxReturnsQuery();
  const [createReturn, { isLoading: isCreating }] = useCreateTaxReturnMutation();

  const handleCreate = useCallback(async () => {
    try {
      const result = await createReturn({ tax_year: newYear, filing_status: newFilingStatus }).unwrap();
      showSuccess(`Tax return for ${newYear} created`);
      setShowCreate(false);
      navigate(`/tax-returns/${result.id}`);
    } catch {
      showError("I couldn't create that tax return. Please try again.");
    }
  }, [createReturn, newYear, newFilingStatus, showSuccess, showError, navigate]);

  const sortedReturns = [...returns].sort((a, b) => b.tax_year - a.tax_year);

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Tax Returns"
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1.5" />
            New Return
          </Button>
        }
      />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            A tax return here is a workspace I use to organize your documents and calculate your numbers. It&rsquo;s not filed with the IRS &mdash; it&rsquo;s a summary you can review and share with your accountant.
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

      {showCreate ? (
        <Card className="max-w-md">
          <h2 className="text-base font-medium mb-4">Create Tax Return</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tax Year</label>
              <Select value={newYear} onChange={(e) => setNewYear(Number(e.target.value))}>
                {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Filing Status</label>
              <Select value={newFilingStatus} onChange={(e) => setNewFilingStatus(e.target.value)}>
                {FILING_STATUSES.map((fs) => (
                  <option key={fs.value} value={fs.value}>{fs.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <LoadingButton onClick={handleCreate} isLoading={isCreating} loadingText="Creating..." size="sm">
                Create
              </LoadingButton>
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)} disabled={isCreating}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <TaxReturnsListSkeleton />
      ) : sortedReturns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium mb-1">No tax returns yet</p>
          <p className="text-sm">Create your first tax return to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedReturns.map((tr) => {
            const badge = STATUS_BADGE[tr.status];

            return (
              <button
                key={tr.id}
                onClick={() => navigate(`/tax-returns/${tr.id}`)}
                className="border rounded-lg p-6 text-left hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-semibold">{tr.tax_year}</span>
                  <Badge label={badge.label} color={badge.color} />
                </div>
                <p className="text-sm text-muted-foreground capitalize">
                  {tr.filing_status.replace(/_/g, " ")}
                </p>
                {tr.needs_recompute ? (
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-yellow-600">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Needs recompute
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground mt-3">
                  Updated {format(parseISO(tr.updated_at), "MMM d, yyyy")}
                </p>
              </button>
            );
          })}
        </div>
      )}

    </main>
  );
}
