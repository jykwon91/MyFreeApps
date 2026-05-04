import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetLeaseTemplateByIdQuery } from "@/shared/store/leaseTemplatesApi";
import { useGetApplicantByIdQuery } from "@/shared/store/applicantsApi";
import TemplatePicker from "@/app/features/leases/TemplatePicker";
import ApplicantPicker from "@/app/features/leases/ApplicantPicker";
import LeaseGenerateForm from "@/app/features/leases/LeaseGenerateForm";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

/**
 * /leases/new — wires the full generate-lease flow:
 *
 * 1. If ``template_id`` is missing from the URL, shows a template picker.
 * 2. If ``applicant_id`` is missing, shows an applicant picker (approved /
 *    lease_sent stages only).
 * 3. Once both are selected, renders ``LeaseGenerateForm`` which handles the
 *    rest — fetches defaults, renders placeholders, and POSTs to create the
 *    draft lease.
 *
 * URL params:
 *   ?template_id=<uuid>&applicant_id=<uuid>
 *
 * Both params are optional on entry — the page collects whichever are missing.
 * Pre-selected params (e.g. from an "Generate lease" button on the applicant
 * detail page) are honoured immediately, skipping the corresponding picker.
 */
export default function LeaseNew() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven IDs (provided by deep-link entry points).
  const urlTemplateId = searchParams.get("template_id");
  const urlApplicantId = searchParams.get("applicant_id");

  // In-page selections (override the URL params when the user picks manually).
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null);
  const [pickedApplicantId, setPickedApplicantId] = useState<string | null>(null);

  // Resolved IDs — URL wins for initial value; in-page selection overrides.
  const resolvedTemplateId = pickedTemplateId ?? urlTemplateId;
  const resolvedApplicantId = pickedApplicantId ?? urlApplicantId;

  // Fetch the full template detail once we have a template ID (required by LeaseGenerateForm).
  const {
    data: template,
    isLoading: isLoadingTemplate,
    isFetching: isFetchingTemplate,
    isError: isTemplateError,
    refetch: refetchTemplate,
  } = useGetLeaseTemplateByIdQuery(resolvedTemplateId ?? "", {
    skip: !resolvedTemplateId,
  });

  // Fetch the applicant summary once we have an applicant ID (for the name display
  // and the listing_id passthrough).
  const {
    data: applicant,
    isLoading: isLoadingApplicant,
    isFetching: isFetchingApplicant,
    isError: isApplicantError,
    refetch: refetchApplicant,
  } = useGetApplicantByIdQuery(resolvedApplicantId ?? "", {
    skip: !resolvedApplicantId,
  });

  function handleTemplateSelect(t: LeaseTemplateSummary): void {
    setPickedTemplateId(t.id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("template_id", t.id);
        return next;
      },
      { replace: true },
    );
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

  const showTemplatePicker = !resolvedTemplateId;
  const showApplicantPicker = !!resolvedTemplateId && !resolvedApplicantId;
  const showForm =
    !!resolvedTemplateId && !!resolvedApplicantId && !!template && !!applicant;
  const isLoadingForm =
    !!resolvedTemplateId && !!resolvedApplicantId && (isLoadingTemplate || isLoadingApplicant);

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
        subtitle="Pick a template and an applicant, then fill in the placeholders."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Template picker                                            */}
      {/* ------------------------------------------------------------------ */}
      {showTemplatePicker ? (
        <section className="space-y-3" data-testid="template-picker-section">
          <h2 className="text-sm font-semibold">Step 1 — Choose a template</h2>
          <TemplatePicker
            selectedId={resolvedTemplateId}
            onSelect={handleTemplateSelect}
          />
        </section>
      ) : null}

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
      {/* Loading state while fetching template / applicant detail            */}
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
      {/* Template error                                                      */}
      {/* ------------------------------------------------------------------ */}
      {isTemplateError && resolvedTemplateId ? (
        <div data-testid="lease-new-template-error">
          <AlertBox
            variant="error"
            className="flex items-center justify-between gap-3"
          >
            <span>I couldn't load that template. Maybe it was deleted?</span>
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={isFetchingTemplate}
              loadingText="Retrying..."
              onClick={() => refetchTemplate()}
            >
              Retry
            </LoadingButton>
          </AlertBox>
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
      {/* Summary bar — show selected template / applicant names              */}
      {/* ------------------------------------------------------------------ */}
      {resolvedTemplateId && !isLoadingTemplate && template ? (
        <div className="flex flex-wrap gap-3 items-center text-sm" data-testid="lease-new-summary">
          <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground">
            Template:{" "}
            <span className="text-foreground font-medium">{template.name}</span>
          </span>
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
            template={template}
            applicantId={resolvedApplicantId!}
          />
        </section>
      ) : null}
    </main>
  );
}
