import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

export interface MultiTemplatePickerProps {
  selectedIds: string[];
  onToggle: (template: LeaseTemplateSummary) => void;
}

/**
 * Multi-select pick-list of lease templates. Each row is a checkbox + label;
 * the host can pick 1+ templates that will all contribute to the same draft
 * lease.
 *
 * Selection order matters: the first-picked template wins on placeholder-key
 * conflicts (its `default_source` is what auto-fills the merged form). The
 * caller (`LeaseNew`) maintains the order via the array it passes in.
 */
export default function MultiTemplatePicker({
  selectedIds,
  onToggle,
}: MultiTemplatePickerProps) {
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
      <div className="space-y-2" data-testid="multi-template-picker-skeleton">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground py-4 text-center"
        data-testid="multi-template-picker-empty"
      >
        No templates yet — upload one from the{" "}
        <a href="/lease-templates" className="text-primary hover:underline">
          Lease Templates
        </a>{" "}
        page first.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="multi-template-picker-list">
      {templates.map((t) => {
        const checked = selectedIds.includes(t.id);
        const orderIndex = checked ? selectedIds.indexOf(t.id) + 1 : null;
        return (
          <li key={t.id}>
            <label
              className={[
                "w-full flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors min-h-[44px] cursor-pointer",
                checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              ].join(" ")}
              data-testid={`multi-template-option-${t.id}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(t)}
                className="mt-1 h-4 w-4 cursor-pointer"
                aria-label={`Select template ${t.name}`}
                data-testid={`multi-template-checkbox-${t.id}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
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
                {orderIndex !== null ? (
                  <p
                    className="text-xs text-primary mt-1"
                    data-testid={`multi-template-order-${t.id}`}
                  >
                    Selected #{orderIndex}
                  </p>
                ) : null}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
