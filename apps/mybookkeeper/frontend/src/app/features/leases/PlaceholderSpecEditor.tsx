import { useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateLeasePlaceholderMutation } from "@/shared/store/leaseTemplatesApi";
import { LEASE_PLACEHOLDER_INPUT_TYPE_LABELS } from "@/shared/lib/lease-labels";
import {
  LEASE_PLACEHOLDER_INPUT_TYPES,
  type LeasePlaceholderInputType,
} from "@/shared/types/lease/lease-placeholder-input-type";
import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";

interface Props {
  templateId: string;
  placeholders: LeaseTemplatePlaceholder[];
}

/**
 * Inline-editable table for the placeholder spec. Each row is a single
 * placeholder; ``input_type``, ``required``, ``default_source``, and
 * ``computed_expr`` are editable here. ``key`` is read-only because it's the
 * identifier used by the substitution pipeline.
 */
export default function PlaceholderSpecEditor({ templateId, placeholders }: Props) {
  if (placeholders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="placeholders-empty">
        No placeholders detected. Did you upload a template with brackets like
        <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">[TENANT FULL NAME]</code>?
      </p>
    );
  }

  return (
    <div
      className="border rounded-lg overflow-hidden"
      data-testid="placeholder-spec-editor"
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Placeholder</th>
            <th className="px-3 py-2 font-medium">Display label</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium text-center">Required</th>
            <th className="px-3 py-2 font-medium">Default source</th>
            <th className="px-3 py-2 font-medium">Computed</th>
          </tr>
        </thead>
        <tbody>
          {placeholders.map((p) => (
            <PlaceholderSpecRow key={p.id} templateId={templateId} placeholder={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlaceholderSpecRow({
  templateId,
  placeholder,
}: {
  templateId: string;
  placeholder: LeaseTemplatePlaceholder;
}) {
  const [updatePlaceholder] = useUpdateLeasePlaceholderMutation();
  const [draft, setDraft] = useState({
    display_label: placeholder.display_label,
    input_type: placeholder.input_type,
    required: placeholder.required,
    default_source: placeholder.default_source ?? "",
    computed_expr: placeholder.computed_expr ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function commit(field: keyof typeof draft, value: typeof draft[typeof field]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setSaving(true);
    try {
      await updatePlaceholder({
        templateId,
        placeholderId: placeholder.id,
        data: {
          [field]:
            field === "default_source" || field === "computed_expr"
              ? next[field] === ""
                ? null
                : next[field]
              : next[field],
        },
      }).unwrap();
      showSuccess("Saved.");
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 400) showError("That computed expression isn't supported.");
      else showError("Couldn't save. Want to try again?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t" data-testid={`placeholder-row-${placeholder.key}`}>
      <td className="px-3 py-2 font-mono text-xs">{`[${placeholder.key}]`}</td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={draft.display_label}
          onChange={(e) => setDraft((d) => ({ ...d, display_label: e.target.value }))}
          onBlur={(e) => {
            if (e.target.value !== placeholder.display_label) {
              void commit("display_label", e.target.value);
            }
          }}
          className="w-full px-2 py-1 text-sm border rounded"
          disabled={saving}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={draft.input_type}
          onChange={(e) => {
            const next = e.target.value as LeasePlaceholderInputType;
            void commit("input_type", next);
          }}
          className="px-2 py-1 text-sm border rounded"
          disabled={saving}
        >
          {LEASE_PLACEHOLDER_INPUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEASE_PLACEHOLDER_INPUT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(e) => void commit("required", e.target.checked)}
          className="h-4 w-4"
          disabled={saving}
          aria-label="Required"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={draft.default_source}
          placeholder="e.g. applicant.legal_name"
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_source: e.target.value }))
          }
          onBlur={(e) => {
            if ((e.target.value || null) !== placeholder.default_source) {
              void commit("default_source", e.target.value);
            }
          }}
          className="w-full px-2 py-1 text-sm border rounded font-mono text-xs"
          disabled={saving}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={draft.computed_expr}
          placeholder="(MOVE-OUT DATE - MOVE-IN DATE).days"
          onChange={(e) =>
            setDraft((d) => ({ ...d, computed_expr: e.target.value }))
          }
          onBlur={(e) => {
            if ((e.target.value || null) !== placeholder.computed_expr) {
              void commit("computed_expr", e.target.value);
            }
          }}
          className="w-full px-2 py-1 text-sm border rounded font-mono text-xs"
          disabled={saving || draft.input_type !== "computed"}
        />
      </td>
    </tr>
  );
}
