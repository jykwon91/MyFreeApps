import { Link } from "react-router-dom";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

interface Props {
  template: LeaseTemplateSummary;
}

export default function LeaseTemplateCard({ template }: Props) {
  return (
    <Link
      to={`/lease-templates/${template.id}`}
      className="block border rounded-lg p-4 hover:bg-muted transition-colors"
      data-testid={`lease-template-card-${template.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium truncate">{template.name}</h3>
          {template.description ? (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          v{template.version}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground mt-3">
        <span>{template.file_count} {template.file_count === 1 ? "file" : "files"}</span>
        <span>·</span>
        <span>
          {template.placeholder_count}{" "}
          {template.placeholder_count === 1 ? "placeholder" : "placeholders"}
        </span>
      </div>
    </Link>
  );
}
