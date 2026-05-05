import type { LeaseTemplatesListMode } from "@/shared/types/lease/lease-templates-list-mode";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import EmptyState from "@/shared/components/ui/EmptyState";
import LeaseTemplatesListSkeleton from "./LeaseTemplatesListSkeleton";
import LeaseTemplateCard from "./LeaseTemplateCard";

export interface LeaseTemplatesListBodyProps {
  mode: LeaseTemplatesListMode;
  templates: LeaseTemplateSummary[];
}

export default function LeaseTemplatesListBody({ mode, templates }: LeaseTemplatesListBodyProps) {
  switch (mode) {
    case "loading":
      return <LeaseTemplatesListSkeleton />;
    case "empty":
      return <EmptyState message="No templates yet — upload one to get started." />;
    case "list":
      return (
        <ul className="space-y-3" data-testid="lease-templates-list">
          {templates.map((t) => (
            <li key={t.id}>
              <LeaseTemplateCard template={t} />
            </li>
          ))}
        </ul>
      );
  }
}
