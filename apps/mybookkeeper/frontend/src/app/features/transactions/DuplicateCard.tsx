import { useState } from "react";
import { X, ArrowRight, AlertTriangle, AlertCircle, CheckCircle, GitMerge, ChevronUp } from "lucide-react";
import type { DuplicatePair, DuplicateTransaction, MergeFieldSide } from "@/shared/types/transaction/duplicate";
import Badge from "@/shared/components/ui/Badge";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TransactionSide from "@/app/features/transactions/TransactionSide";
import MergeFieldPicker from "@/app/features/transactions/MergeFieldPicker";
import MergePreview from "@/app/features/transactions/MergePreview";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import { computeDefaults, computeSurvivingId, type MergeableField } from "@/app/features/transactions/merge-defaults";

export interface DuplicateCardProps {
  pair: DuplicatePair;
  propertyMap: Map<string, string>;
  onMerge: (
    transactionAId: string,
    transactionBId: string,
    survivingId: string,
    fieldOverrides: Record<string, MergeFieldSide>,
  ) => Promise<void>;
  onDismiss: (ids: string[]) => Promise<void>;
}

function getSourceLabel(txn: DuplicateTransaction): string {
  if (txn.source_file_name) {
    const ext = txn.source_file_name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "Invoice/PDF";
    if (ext === "csv" || ext === "xlsx") return "Bank import";
  }
  if (txn.is_manual) return "Manual entry";
  return "Document";
}

function getConfidenceConfig(
  confidence: string,
): { icon: React.ReactNode; label: string; color: "green" | "yellow" | "orange" } {
  switch (confidence) {
    case "high":
      return { icon: <CheckCircle size={14} />, label: "High confidence", color: "green" };
    case "medium":
      return { icon: <AlertTriangle size={14} />, label: "Medium confidence", color: "yellow" };
    default:
      return { icon: <AlertCircle size={14} />, label: "Low confidence", color: "orange" };
  }
}

export default function DuplicateCard({ pair, propertyMap, onMerge, onDismiss }: DuplicateCardProps) {
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const defaults = computeDefaults(pair.transaction_a, pair.transaction_b);
  const [selections, setSelections] = useState<Record<MergeableField, MergeFieldSide>>(defaults);

  const labelA = getSourceLabel(pair.transaction_a);
  const labelB = getSourceLabel(pair.transaction_b);
  const confidenceConfig = getConfidenceConfig(pair.confidence ?? "medium");

  const survivingSide = computeSurvivingId(pair.transaction_a, pair.transaction_b);
  const survivingId =
    survivingSide === "a" ? pair.transaction_a.id : pair.transaction_b.id;

  function handleSelectionChange(field: MergeableField, side: MergeFieldSide) {
    setSelections((prev) => ({ ...prev, [field]: side }));
  }

  function handleOpenMerge() {
    // Reset defaults each time we open
    setSelections(computeDefaults(pair.transaction_a, pair.transaction_b));
    setMergeOpen(true);
  }

  async function handleConfirmMerge() {
    setViewingDocId(null);
    setBusy("merge");
    try {
      await onMerge(
        pair.transaction_a.id,
        pair.transaction_b.id,
        survivingId,
        selections as Record<string, MergeFieldSide>,
      );
    } finally {
      setBusy(null);
      setMergeOpen(false);
    }
  }

  async function handleDismiss() {
    setViewingDocId(null);
    setBusy("dismiss");
    try {
      await onDismiss([pair.transaction_a.id, pair.transaction_b.id]);
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-1.5 text-sm">
          {confidenceConfig.icon}
          <span className="font-medium">
            {pair.date_diff_days === 0
              ? "Same amount, same date"
              : `Same amount, ${pair.date_diff_days} day${pair.date_diff_days === 1 ? "" : "s"} apart`}
          </span>
        </div>
        <Badge label={confidenceConfig.label} color={confidenceConfig.color} />
        {!pair.property_match ? (
          <Badge label="Different properties" color="orange" />
        ) : null}
      </div>

      {/* Side-by-side transaction summary */}
      <div className="flex flex-col sm:flex-row gap-3 p-4">
        <TransactionSide txn={pair.transaction_a} propertyMap={propertyMap} label={labelA} onViewSource={setViewingDocId} />
        <div className="flex items-center justify-center sm:flex-col gap-1 text-muted-foreground">
          <ArrowRight size={16} className="hidden sm:block" />
          <span className="text-xs">vs</span>
        </div>
        <TransactionSide txn={pair.transaction_b} propertyMap={propertyMap} label={labelB} onViewSource={setViewingDocId} />
      </div>

      {/* Inline merge picker */}
      {mergeOpen && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Pick the best value for each field — the surviving record will be saved.
            </p>
            <button
              type="button"
              onClick={() => setMergeOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Collapse merge picker"
            >
              <ChevronUp size={16} />
            </button>
          </div>

          {/* Source document context — clickable to view */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[{ label: "Source A", txn: pair.transaction_a }, { label: "Source B", txn: pair.transaction_b }].map(({ label: srcLabel, txn }) => (
              <div key={srcLabel} className="rounded border px-2.5 py-2 bg-muted/30">
                <span className="font-medium text-muted-foreground uppercase tracking-wide">{srcLabel}: </span>
                {txn.source_document_id ? (
                  <button
                    type="button"
                    onClick={() => setViewingDocId(txn.source_document_id!)}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {txn.source_file_name ?? "View document"}
                  </button>
                ) : (
                  <span className="text-foreground">{txn.source_file_name ?? "No document"}</span>
                )}
              </div>
            ))}
          </div>

          <MergeFieldPicker
            txnA={pair.transaction_a}
            txnB={pair.transaction_b}
            labelA={labelA}
            labelB={labelB}
            propertyMap={propertyMap}
            selections={selections}
            onSelectionChange={handleSelectionChange}
          />

          <MergePreview
            txnA={pair.transaction_a}
            txnB={pair.transaction_b}
            selections={selections}
            propertyMap={propertyMap}
          />

          <div className="flex items-center gap-2 pt-1">
            <LoadingButton
              size="sm"
              isLoading={busy === "merge"}
              loadingText="Merging..."
              disabled={isBusy}
              onClick={handleConfirmMerge}
              className="min-h-[44px] sm:min-h-0"
            >
              <GitMerge size={14} className="mr-1" />
              Confirm Merge
            </LoadingButton>
            <LoadingButton
              size="sm"
              variant="secondary"
              disabled={isBusy}
              onClick={() => setMergeOpen(false)}
              className="min-h-[44px] sm:min-h-0"
            >
              Cancel
            </LoadingButton>
          </div>
        </div>
      )}

      {/* Action bar */}
      {!mergeOpen && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 px-4 py-3 border-t bg-muted/20">
          <LoadingButton
            size="sm"
            variant="secondary"
            isLoading={busy === "dismiss"}
            loadingText="Dismissing..."
            disabled={isBusy}
            onClick={handleDismiss}
            className="min-h-[44px] sm:min-h-0"
          >
            <X size={14} className="mr-1" />
            Not Duplicates
          </LoadingButton>
          <LoadingButton
            size="sm"
            disabled={isBusy}
            onClick={handleOpenMerge}
            className="min-h-[44px] sm:min-h-0"
          >
            <GitMerge size={14} className="mr-1" />
            Merge
          </LoadingButton>
        </div>
      )}

      {viewingDocId && (
        <DocumentViewer
          documentId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
      )}
    </div>
  );
}
