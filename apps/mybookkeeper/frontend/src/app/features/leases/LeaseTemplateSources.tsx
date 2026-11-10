import { FileText } from "lucide-react";
import { LEASE_TEMPLATE_SOURCE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateSource";
import type { SignedLeaseTemplateLink } from "@mybookkeeper/api-client/types/lease/signed-lease-template-link";
import { leaseTemplateSourceLabel } from "@mybookkeeper/api-client/utils/leaseTemplateSourceLabel";

export interface LeaseTemplateSourcesProps {
  templates: SignedLeaseTemplateLink[];
}

/** Which template (and version) each rendered document came from. Hidden until something is rendered. */
export default function LeaseTemplateSources({ templates }: LeaseTemplateSourcesProps) {
  const rendered = templates.filter((t) => leaseTemplateSourceLabel(t) !== null);
  if (rendered.length === 0) return null;
  return (
    <section className="border rounded-lg p-3" data-testid="lease-template-sources">
      <h3 className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-2">
        {LEASE_TEMPLATE_SOURCE_COPY.heading}
      </h3>
      <ul className="space-y-1">
        {rendered.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm" data-testid="lease-template-source">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{leaseTemplateSourceLabel(t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
