import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import { useGetApplicantByIdQuery } from "@/shared/store/applicantsApi";
import MultiTemplatePicker from "@/app/features/leases/MultiTemplatePicker";
import ApplicantPicker from "@/app/features/leases/ApplicantPicker";
import LeaseGenerateForm from "@/app/features/leases/LeaseGenerateForm";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

/**
 * /leases/new — wires the full generate-lease flow:
 *
 * 1. Pick 1+ templates (checkbox list).
 * 2. Pick an applicant (approved / lease_sent stages only).
 * 3. Fill in the merged placeholder set and submit.
 *
 * URL params:
 *   ?template_ids=<uuid>,<uuid>&applicant_id=<uuid>
 *
 * Both params are optional on entry — the page collects whichever are missing.
 * The legacy single ``template_id=<uuid>`` param is also accepted for deep
 * links from places like the templates list page.
 */
export default function LeaseNew() {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTemplateIdsParam = searchParams.get("template_ids");
  const urlSingleTemplateId = searchParams.get("template_id");
  const urlApplicantId = searchParams.get("applicant_id");

  const initialTemplateIds: string[] = useMemo(() => {
    if (urlTemplateIdsParam) {
      return urlTemplateIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (urlSingleTemplateId) return [urlSingleTemplateId];
    return [];
  }, [urlTemplateIdsParam, urlSingleTemplateId]);

  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    initialTemplateIds,
  );
  const [pickedApplicantId, setPickedApplicantId] = useState<string | null>(null);

  // Re-sync once if the URL provided initial templates after mount.
  useEffect(() => {
    if (initialTemplateIds.length > 0 && selectedTemplateIds.length === 0) {
      setSelectedTemplateIds(initialTemplateIds);
    }
    // Only fires once when initialTemplateIds is non-empty on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedApplicantId = pickedApplicantId ?? urlApplicantId;

  // Fetch all templates once (lightweight) so we can map IDs → labels for the
  // generate form's "Used by" hint.
  const { data: templatesData } = useGetLeaseTemplatesQuery();
  const templateById = useMemo(() => {
    const items = templatesData?.items ?? [];
    return items.reduce<Record<string, LeaseTemplateSummary>>((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {});
  }, [templatesData]);

  const templateLabels = useMemo<Record<string, string>>(() => {
    return selectedTemplateIds.reduce<Record<string, string>>((acc, id) => {
      acc[id] = templateById[id]?.name ?? id.slice(0, 8);
      return acc;
    }, {});
  }, [selectedTemplateIds, templateById]);

  const {
    data: applicant,
    isLoading: isLoadingApplicant,
    isFetching: isFetchingApplicant,
    isError: isApplicantError,
    refetch: refetchApplicant,
  } = useGetApplicantByIdQuery(resolvedApplicantId ?? "", {
    skip: !resolvedApplicantId,
  });

  function handleToggleTemplate(t: LeaseTemplateSummary): void {
    setSelectedTemplateIds((prev) => {
      const next = prev.includes(t.id)
        ? prev.filter((id) => id !== t.id)
        : [...prev, t.id];
      // Persist selection in URL so deep-links + back/forward work.
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next.length > 0) {
            params.set("template_ids", next.join(","));
          } else {
            params.delete("template_ids");
          }
          // Drop the legacy single-template param when we set the multi form.
          params.delete("template_id");
          return params;
        },
        { replace: true },
      );
      return next;
    });
  }

  function handleApplicantSelect(a: ApplicantSummary): void {
    setPickedApplicantId(a.id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("applicant_id", a.id);
        return next;
      },
      { replace: true },
    );
  }

  const hasTemplate = selectedTemplateIds.length > 0;
  const showApplicantPicker = hasTemplate && !resolvedApplicantId;
  const showForm = hasTemplate && !!resolvedApplicantId && !!applicant;
  const isLoadingForm =
    hasTemplate && !!resolvedApplicantId && isLoadingApplicant;

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl" data-testid="lease-new-page">
      <Link
        to="/leases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
        data-testid="lease-new-back-link"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to leases
      </Link>

      <SectionHeader
        title="Generate lease"
        subtitle="Pick one or more templates and an applicant, then fill in the placeholders."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Template multi-picker (always visible while picking)       */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3" data-testid="template-picker-section">
        <h2 className="text-sm font-semibold">
          Step 1 — Choose one or more templates
        </h2>
        <MultiTemplatePicker
          selectedIds={selectedTemplateIds}
          onToggle={handleToggleTemplate}
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Applicant picker                                           */}
      {/* ------------------------------------------------------------------ */}
      {showApplicantPicker ? (
        <section className="space-y-3" data-testid="applicant-picker-section">
          <h2 className="text-sm font-semibold">Step 2 — Choose an applicant</h2>
          <ApplicantPicker
            selectedId={resolvedApplicantId}
            onSelect={handleApplicantSelect}
          />
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Loading state while fetching applicant detail                       */}
      {/* ------------------------------------------------------------------ */}
      {isLoadingForm ? (
        <div className="space-y-4" data-testid="lease-new-form-skeleton">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Applicant error                                                     */}
      {/* ------------------------------------------------------------------ */}
      {isApplicantError && resolvedApplicantId ? (
        <div data-testid="lease-new-applicant-error">
          <AlertBox
            variant="error"
            className="flex items-center justify-between gap-3"
          >
            <span>I couldn't load that applicant. Maybe they were removed?</span>
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={isFetchingApplicant}
              loadingText="Retrying..."
              onClick={() => refetchApplicant()}
            >
              Retry
            </LoadingButton>
          </AlertBox>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Summary bar — show selected templates + applicant name              */}
      {/* ------------------------------------------------------------------ */}
      {hasTemplate || resolvedApplicantId ? (
        <div
          className="flex flex-wrap gap-2 items-center text-sm"
          data-testid="lease-new-summary"
        >
          {selectedTemplateIds.map((id) => (
            <span
              key={id}
              className="px-2 py-1 rounded-md bg-muted text-muted-foreground"
              data-testid={`lease-new-summary-template-${id}`}
            >
              Template:{" "}
              <span className="text-foreground font-medium">
                {templateById[id]?.name ?? id.slice(0, 8)}
              </span>
            </span>
          ))}
          {resolvedApplicantId && applicant ? (
            <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground">
              Applicant:{" "}
              <span className="text-foreground font-medium">
                {applicant.legal_name ?? "Unnamed applicant"}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Generate form                                              */}
      {/* ------------------------------------------------------------------ */}
      {showForm ? (
        <section className="space-y-3" data-testid="lease-generate-form-section">
          <h2 className="text-sm font-semibold">Fill in placeholders</h2>
          <LeaseGenerateForm
            templateIds={selectedTemplateIds}
            templateLabels={templateLabels}
            applicantId={resolvedApplicantId!}
          />
        </section>
      ) : null}
    </main>
  );
}
