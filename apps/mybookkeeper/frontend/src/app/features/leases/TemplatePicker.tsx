import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

export interface TemplatePickerProps {
  selectedId: string | null;
  onSelect: (template: LeaseTemplateSummary) => void;
}

/**
 * Renders a pick-list of lease templates. The selected item is highlighted.
 * Used on /leases/new when no template_id query param is present.
 */
export default function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  const { data, isLoading, isFetching, isError, refetch } =
    useGetLeaseTemplatesQuery();
  const templates = data?.items ?? [];

  if (isError) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>I couldn't load your templates. Want me to try again?</span>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isFetching}
          loadingText="Retrying..."
          onClick={() => refetch()}
        >
          Retry
        </LoadingButton>
      </AlertBox>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="template-picker-skeleton">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center" data-testid="template-picker-empty">
        No templates yet — upload one from the{" "}
        <a href="/lease-templates" className="text-primary hover:underline">
          Lease Templates
        </a>{" "}
        page first.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="template-picker-list">
      {templates.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t)}
            className={[
              "w-full text-left border rounded-lg px-4 py-3 transition-colors min-h-[44px]",
              selectedId === t.id
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
            ].join(" ")}
            data-testid={`template-option-${t.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{t.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                v{t.version}
              </span>
            </div>
            {t.description ? (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {t.description}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-1">
              {t.placeholder_count}{" "}
              {t.placeholder_count === 1 ? "placeholder" : "placeholders"}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
