import { Link, useNavigate } from "react-router-dom";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

interface Props {
  template: LeaseTemplateSummary;
}

export default function LeaseTemplateCard({ template }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="border rounded-lg p-4 hover:bg-muted/40 transition-colors"
      data-testid={`lease-template-card-${template.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to={`/lease-templates/${template.id}`}
          className="min-w-0 flex-1 hover:underline"
        >
          <h3 className="font-medium truncate">{template.name}</h3>
          {template.description ? (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          ) : null}
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            v{template.version}
          </span>
          <button
            type="button"
            onClick={() => navigate(`/leases/new?template_id=${template.id}`)}
            className="text-xs text-primary hover:underline font-medium min-h-[44px] sm:min-h-[32px] px-2"
            data-testid={`generate-lease-from-template-${template.id}`}
          >
            Generate lease...
          </button>
        </div>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground mt-3">
        <span>{template.file_count} {template.file_count === 1 ? "file" : "files"}</span>
        <span>·</span>
        <span>
          {template.placeholder_count}{" "}
          {template.placeholder_count === 1 ? "placeholder" : "placeholders"}
        </span>
      </div>
    </div>
  );
}
