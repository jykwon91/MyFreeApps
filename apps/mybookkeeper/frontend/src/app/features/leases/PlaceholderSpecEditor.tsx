import PlaceholderSpecRow from "@/app/features/leases/PlaceholderSpecRow";
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
