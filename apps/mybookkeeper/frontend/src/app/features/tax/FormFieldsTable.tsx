import { useState, useCallback } from "react";
import { Pencil, FileText } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import Badge from "@/shared/components/ui/Badge";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import type { TaxFormField, FieldValueType, SourceType } from "@/shared/types/tax/tax-form";
import { VALIDATION_ICONS, SOURCE_BADGES, PII_FIELDS, SSN_REGEX } from "@/shared/lib/tax-form-config";

type FieldSourceMode = "calculated" | "overridden" | "sourced";

function resolveFieldSourceMode(field: TaxFormField): FieldSourceMode {
  if (field.is_calculated) return "calculated";
  if (field.is_overridden) return "overridden";
  return "sourced";
}

function resolveFieldSourceBadge(
  mode: FieldSourceMode,
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
  onOverride: (fieldId: string, value: number | string | boolean | null, reason: string, fieldType: FieldValueType) => void;
  isSaving: boolean;
}

function maskPii(fieldId: string, value: string): string {
  if (PII_FIELDS.has(fieldId)) {
    return value.length >= 4 ? "***" + value.slice(-4) : "****";
  }
  return value.replace(SSN_REGEX, (m) => "***-**-" + m.slice(-4));
}

function formatFieldValue(field: TaxFormField): string {
  if (field.value == null) return "\u2014";
  if (field.type === "numeric") return maskPii(field.field_id, formatCurrency(field.value as number));
  if (field.type === "boolean") return field.value ? "Yes" : "No";
  return maskPii(field.field_id, String(field.value));
}

export default function FormFieldsTable({ fields, instanceLabel, sourceType, documentId, onOverride, isSaving }: FormFieldsTableProps) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [showDocViewer, setShowDocViewer] = useState(false);

  const badge = SOURCE_BADGES[sourceType];

  const startEdit = useCallback((field: TaxFormField) => {
    setEditingFieldId(field.id);
    setEditValue(field.value != null ? String(field.value) : "");
    setEditReason("");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingFieldId(null);
    setEditValue("");
    setEditReason("");
  }, []);

  const saveEdit = useCallback((field: TaxFormField) => {
    if (!editReason.trim()) return;
    let parsedValue: number | string | boolean | null;
    if (field.type === "numeric") {
      parsedValue = editValue === "" ? null : parseFloat(editValue);
    } else if (field.type === "boolean") {
      parsedValue = editValue.toLowerCase() === "true" || editValue === "1";
    } else {
      parsedValue = editValue || null;
    }
    onOverride(field.id, parsedValue, editReason.trim(), field.type);
    setEditingFieldId(null);
    setEditValue("");
    setEditReason("");
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

            const fieldSourceMode = resolveFieldSourceMode(field);
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
                        type={field.type === "numeric" ? "number" : "text"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-full text-right"
                        autoFocus
                      />
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
                    <span className="font-medium">{formatFieldValue(field)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge label={fieldSourceBadge.label} color={fieldSourceBadge.color} />
                </td>
                <td className="px-4 py-3 text-center">
                  {VALIDATION_ICONS[field.validation_status]}
                </td>
                <td className="px-4 py-3 text-center">
                  {!isEditing ? (
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
