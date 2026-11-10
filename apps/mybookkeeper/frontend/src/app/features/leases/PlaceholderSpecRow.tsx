import { useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateLeasePlaceholderMutation } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import {
  LEASE_PLACEHOLDER_INPUT_TYPE_LABELS,
  LEASE_PLACEHOLDER_INPUT_TYPES,
} from "@mybookkeeper/api-client/constants/leaseLabels";
import type { LeasePlaceholderFormField } from "@mybookkeeper/api-client/types/lease/lease-placeholder-form-field";
import type { LeasePlaceholderFormValues } from "@mybookkeeper/api-client/types/lease/lease-placeholder-form-values";
import type { LeasePlaceholderInputType } from "@mybookkeeper/api-client/types/lease/lease-placeholder-input-type";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";
import { placeholderToFormValues, placeholderUpdateRequest } from "@mybookkeeper/api-client/utils/leasePlaceholderForm";
import { leaseTemplateFailure } from "@mybookkeeper/api-client/utils/leaseTemplateFailure";

export interface PlaceholderSpecRowProps {
  templateId: string;
  placeholder: LeaseTemplatePlaceholder;
}

/**
 * Single row in the placeholder spec editor table.
 *
 * On blur (text inputs) or change (select / checkbox) the row commits the
 * change via the update-placeholder mutation; the parent invalidates the
 * template cache tag automatically.
 */
export default function PlaceholderSpecRow({ templateId, placeholder }: PlaceholderSpecRowProps) {
  const [updatePlaceholder] = useUpdateLeasePlaceholderMutation();
  const [draft, setDraft] = useState<LeasePlaceholderFormValues>(() => placeholderToFormValues(placeholder));
  const [saving, setSaving] = useState(false);

  async function commit<Field extends LeasePlaceholderFormField>(field: Field, value: LeasePlaceholderFormValues[Field]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setSaving(true);
    try {
      await updatePlaceholder({
        templateId,
        placeholderId: placeholder.id,
        data: placeholderUpdateRequest(next, [field]),
      }).unwrap();
      showSuccess("Saved.");
    } catch (e: unknown) {
      if (leaseTemplateFailure(e) === "rejected") showError("That computed expression isn't supported.");
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
