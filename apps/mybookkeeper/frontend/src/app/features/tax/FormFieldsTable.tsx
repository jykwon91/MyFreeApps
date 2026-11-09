import { useState, useCallback } from "react";
import { Pencil, FileText } from "lucide-react";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import type { SourceType } from "@mybookkeeper/api-client/types/tax/SourceType";
import type { TaxFieldOverrideValue } from "@mybookkeeper/api-client/types/tax/TaxFieldOverrideValue";
import type { FieldOverrideProblems } from "@mybookkeeper/api-client/types/tax/FieldOverrideProblems";
import { formatTaxFieldValue } from "@mybookkeeper/api-client/utils/formatTaxFieldValue";
import { taxFieldSourceMode } from "@mybookkeeper/api-client/utils/taxFieldSourceMode";
import { parseTaxFieldOverride, taxFieldEditText, taxFieldOverrideProblems } from "@mybookkeeper/api-client/utils/taxFieldOverride";
import { VALIDATION_ICONS, SOURCE_BADGES } from "@/shared/lib/tax-form-config";

function resolveFieldSourceBadge(
  mode: ReturnType<typeof taxFieldSourceMode>,
  fallback: { label: string; color: BadgeColor },
): { label: string; color: BadgeColor } {
  switch (mode) {
    case "calculated": return { label: "Calc", color: "gray" };
    case "overridden": return { label: "Override", color: "orange" };
    case "sourced": return fallback;
  }
}

export interface FormFieldsTableProps {
  fields: TaxFormField[];
  instanceLabel: string | null;
  sourceType: SourceType;
  documentId?: string | null;
  /** Resolves true when the server accepted the override. */
  onOverride: (fieldId: string, override: TaxFieldOverrideValue, reason: string) => Promise<boolean>;
  isSaving: boolean;
  canOverride: boolean;
}

export default function FormFieldsTable({ fields, instanceLabel, sourceType, documentId, onOverride, isSaving, canOverride }: FormFieldsTableProps) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [problems, setProblems] = useState<FieldOverrideProblems>({});
  const [showDocViewer, setShowDocViewer] = useState(false);

  const badge = SOURCE_BADGES[sourceType];

  const startEdit = useCallback((field: TaxFormField) => {
    setEditingFieldId(field.id);
    setEditValue(taxFieldEditText(field));
    setEditReason("");
    setProblems({});
  }, []);

  const cancelEdit = useCallback(() => {
    setProblems({});
    setEditingFieldId(null);
    setEditValue("");
    setEditReason("");
  }, []);

  const saveEdit = useCallback(async (field: TaxFormField) => {
    if (!editReason.trim()) return;
    // A blank box is sent as null, which the server treats as an explicit clear; unreadable or hidden values are pointed out.
    const found = taxFieldOverrideProblems(field.type, editValue, editReason, true);
    const parsed = parseTaxFieldOverride(field.type, editValue, true);
    if (found.number || !parsed) {
      setProblems({ number: found.number });
      return;
    }
    // The editor stays open until the server accepts, so a rejected value can be corrected.
    if (!(await onOverride(field.id, parsed, editReason.trim()))) return;
    setEditingFieldId(null);
    setEditValue("");
    setEditReason("");
    setProblems({});
  }, [editValue, editReason, onOverride]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {instanceLabel ? (
        <div className="px-4 py-2 bg-muted border-b flex items-center gap-2">
          <span className="text-sm font-medium">{instanceLabel}</span>
          <Badge label={badge.label} color={badge.color} />
          {documentId ? (
            <button
              onClick={() => setShowDocViewer(true)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1.5 rounded hover:bg-primary/5"
              title="View source document"
            >
              <FileText className="h-3.5 w-3.5" />
              View source
            </button>
          ) : null}
        </div>
      ) : null}
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Label</th>
            <th className="text-right px-4 py-3 font-medium w-40">Value</th>
            <th className="text-center px-4 py-3 font-medium w-20">Source</th>
            <th className="text-center px-4 py-3 font-medium w-20">Status</th>
            <th className="text-center px-4 py-3 font-medium w-12" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => {
            const isEditing = editingFieldId === field.id;

            const fieldSourceMode = taxFieldSourceMode(field);
            const fieldSourceBadge = resolveFieldSourceBadge(fieldSourceMode, badge);
            return (
              <tr
                key={field.id}
                className={field.is_overridden ? "bg-orange-50 dark:bg-orange-950/20" : undefined}
              >
                <td className="px-4 py-3">
                  {field.label}
                  {field.validation_message ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{field.validation_message}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        inputMode={field.type === "numeric" ? "decimal" : undefined}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-full text-right"
                        autoFocus
                      />
                      {problems.number ? <p className="text-xs text-red-600 text-right">{problems.number}</p> : null}
                      <input
                        type="text"
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        placeholder="Reason for override..."
                        className="border rounded px-2 py-1 text-xs w-full"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={cancelEdit}
                          className="text-xs text-muted-foreground hover:underline px-2 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(field)}
                          disabled={!editReason.trim() || isSaving}
                          className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {isSaving ? (
                            <>
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Saving...
                            </>
                          ) : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="font-medium">{formatTaxFieldValue(field)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge label={fieldSourceBadge.label} color={fieldSourceBadge.color} />
                </td>
                <td className="px-4 py-3 text-center">
                  {VALIDATION_ICONS[field.validation_status]}
                </td>
                <td className="px-4 py-3 text-center">
                  {!isEditing && canOverride ? (
                    <button
                      onClick={() => startEdit(field)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Override value"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showDocViewer && documentId ? (
        <DocumentViewer documentId={documentId} onClose={() => setShowDocViewer(false)} />
      ) : null}
    </div>
  );
}
